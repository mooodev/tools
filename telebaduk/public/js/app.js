// Main App Controller - navigation, Telegram integration, game logic
(function() {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.expand();
    if (tg.requestFullscreen) tg.requestFullscreen();
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
  }

  // ─── STATE ───
  let socket = null;
  let myColor = null;
  let myRole = null;
  let gameId = null;
  let boardSize = 19;
  let board = null;
  let currentPlayer = 1;
  let gameStatus = 'lobby';
  let lastMove = null;
  let showingInfluence = false;
  let effectsClock = performance.now();
  let userId = null;
  let userName = null;
  let blackCaptures = 0;
  let whiteCaptures = 0;

  const navStack = [];

  // ─── INIT ───
  function init() {
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      userId = String(tg.initDataUnsafe.user.id);
      userName = tg.initDataUnsafe.user.first_name || 'Player';
      // Auto-detect language from Telegram
      const lc = tg.initDataUnsafe.user.language_code;
      if (lc && lc.startsWith('ru') && !localStorage.getItem('telebaduk_lang')) {
        I18n.setLang('ru');
      }
    } else {
      userId = 'dev_' + Math.random().toString(36).slice(2, 8);
      userName = 'Dev';
    }

    const params = new URLSearchParams(window.location.search);
    gameId = params.get('game') || params.get('tgWebAppStartParam');
    if (!gameId && tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
      gameId = tg.initDataUnsafe.start_param;
    }

    setupNavigation();
    setupTabs();
    setupGameControls();
    setupLangSelector();
    applyI18n();

    if (gameId) {
      navigateTo('game');
      connectToGame(gameId);
    } else {
      navigateTo('lobby');
      loadMyGames();
      loadPublicGames();
    }

    requestAnimationFrame(effectsLoop);
  }

  function applyI18n() {
    I18n.updateDOM();
    // Update lang selector active state
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === I18n.getLang());
    });
  }

  function setupLangSelector() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        I18n.setLang(btn.dataset.lang);
        applyI18n();
      });
    });
  }

  // ─── NAVIGATION ───
  function navigateTo(screen) {
    const prev = document.querySelector('.screen.active');
    if (prev) {
      const prevId = prev.id.replace('screen-', '');
      if (prevId !== screen) navStack.push(prevId);
      prev.classList.remove('active');
    }
    document.getElementById('screen-' + screen).classList.add('active');
    updateBackButton();
  }

  function goBack() {
    if (navStack.length === 0) {
      if (tg) tg.close();
      return;
    }
    const prev = navStack.pop();
    document.querySelector('.screen.active').classList.remove('active');
    document.getElementById('screen-' + prev).classList.add('active');

    if (prev === 'lobby') {
      if (socket) { socket.disconnect(); socket = null; }
      gameId = null;
      myColor = null;
      myRole = null;
      gameStatus = 'lobby';
      loadMyGames();
      loadPublicGames();
    }
    updateBackButton();
  }

  function updateBackButton() {
    if (!tg) return;
    if (navStack.length > 0 || gameId) tg.BackButton.show();
    else tg.BackButton.hide();
  }

  function setupNavigation() {
    if (tg && tg.BackButton) tg.BackButton.onClick(goBack);
    document.getElementById('btn-back-lobby').addEventListener('click', goBack);
  }

  // ─── TABS ───
  function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        Haptics.buttonTap();
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'public-games') loadPublicGames();
      });
    });
  }

  // ─── LOBBY ───
  function loadMyGames() {
    fetch('/api/games/player/' + userId)
      .then(r => r.json())
      .then(games => renderGamesList('my-games-list', games, true))
      .catch(() => {});
  }

  function loadPublicGames() {
    fetch('/api/games/public')
      .then(r => r.json())
      .then(games => renderGamesList('public-games-list', games, false))
      .catch(() => {});
  }

  function renderGamesList(containerId, games, isMine) {
    const el = document.getElementById(containerId);
    if (!games || games.length === 0) {
      el.innerHTML = `<div class="empty-state">${isMine ? I18n.t('noGames') : I18n.t('noPublicGames')}</div>`;
      return;
    }
    el.innerHTML = games.map(g => {
      const black = g.players.black || '???';
      const white = g.players.white || I18n.t('waiting');
      const statusCls = g.status === 'active' ? 'active' : g.status === 'waiting' ? 'waiting' : 'finished';
      const statusText = g.status === 'active' ? I18n.t('live') : g.status === 'waiting' ? I18n.t('open') : I18n.t('done');
      return `
        <div class="game-card" data-id="${g.id}">
          <div class="game-card-board">${g.size}</div>
          <div class="game-card-info">
            <div class="game-card-players">${esc(black)} ${I18n.t('vs')} ${esc(white)}</div>
            <div class="game-card-meta">${I18n.t('move')} ${g.moveCount} &middot; ${g.spectatorCount} ${I18n.t('watching')}</div>
          </div>
          <div class="game-card-status ${statusCls}">${statusText}</div>
        </div>`;
    }).join('');

    el.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', () => {
        Haptics.buttonTap();
        gameId = card.dataset.id;
        navigateTo('game');
        connectToGame(gameId);
      });
    });
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ─── GAME CONNECTION ───
  function connectToGame(id) {
    if (socket) socket.disconnect();
    showOverlay('waiting-overlay');
    socket = io();

    socket.on('connect', () => {
      socket.emit('join', { gameId: id, userId, userName });
    });

    socket.on('joined', onJoined);
    socket.on('playerJoined', onPlayerJoined);
    socket.on('movePlayed', onMovePlayed);
    socket.on('passed', onPassed);
    socket.on('enterScoring', onEnterScoring);
    socket.on('scoringUpdate', onScoringUpdate);
    socket.on('scoreConfirmedBy', onScoreConfirmedBy);
    socket.on('gameOver', onGameOver);
    socket.on('redoRequested', onRedoRequested);
    socket.on('redoAccepted', onRedoAccepted);
    socket.on('redoRejected', onRedoRejected);
    socket.on('playerDisconnected', onPlayerDisconnected);
    socket.on('spectatorCount', onSpectatorCount);
    socket.on('influenceUpdate', onInfluenceUpdate);
    socket.on('error', () => {
      Sounds.error();
      Haptics.error();
    });
  }

  // ─── SOCKET HANDLERS ───
  function onJoined(data) {
    myRole = data.role;
    myColor = data.color || null;
    boardSize = data.settings.size;
    gameStatus = data.status;

    const g = data.game;
    board = g.board;
    currentPlayer = g.currentPlayer;

    // Init capture counts from game state
    blackCaptures = g.captures ? g.captures[1] || g.captures['1'] || 0 : 0;
    whiteCaptures = g.captures ? g.captures[2] || g.captures['2'] || 0 : 0;

    const canvas = document.getElementById('board-canvas');
    const container = document.getElementById('board-container');
    Board3D.init(canvas, container, boardSize);
    Board3D.myColor = myColor || 1;
    Effects.init(Board3D.scene, Board3D.stonesGroup);

    Board3D.onIntersect = (x, y) => {
      if (myRole !== 'player' || gameStatus !== 'active') return;
      if (currentPlayer !== myColor) return;
      socket.emit('move', { x, y });
    };

    Board3D.onScoringTap = (x, y) => {
      if (myRole !== 'player' || gameStatus !== 'scoring') return;
      if (board[y][x] !== 0) socket.emit('toggleDead', { x, y });
    };

    lastMove = null;
    if (g.moves && g.moves.length > 0) {
      const lm = g.moves[g.moves.length - 1];
      if (!lm.pass) lastMove = { x: lm.x, y: lm.y };
    }

    Board3D.syncBoard(board, { myColor, lastMove });

    updatePlayerBars(data.players);
    updateCaptureDisplay();
    updateStatus();
    updateControls();

    if (data.status === 'waiting') {
      showOverlay('waiting-overlay');
    } else {
      hideAllOverlays();
      if (g.moveCount > 0) {
        Board3D.playEntranceAnimation();
      } else {
        Sounds.gameStart();
        Effects.startRipple(boardSize);
      }
    }

    if (g.moveCount > 0) socket.emit('getInfluence');
    window.addEventListener('resize', () => Board3D.resize());
  }

  function onPlayerJoined(data) {
    hideOverlay('waiting-overlay');
    gameStatus = data.status || 'active';
    updateStatus();
    Sounds.gameStart();
    Effects.startRipple(boardSize);

    const oppName = data.name || I18n.t('opponent');
    const oppBar = document.querySelector('.player-bar.opp-bar .player-name');
    if (oppBar) oppBar.textContent = oppName;
  }

  function onMovePlayed(data) {
    board[data.y][data.x] = data.color;
    currentPlayer = data.currentPlayer;
    lastMove = { x: data.x, y: data.y };

    Board3D.addStone(data.x, data.y, data.color, true);
    Effects.placeRipple(data.x, data.y, data.color);
    Sounds.stonePlace();
    Haptics.stonePlace();

    if (data.captured && data.captured.length > 0) {
      for (const [cx, cy] of data.captured) {
        board[cy][cx] = 0;
        Board3D.removeStone(cx, cy, true);
      }
      Effects.captureEffect(data.captured, data.color === 1 ? 2 : 1);
      Sounds.capture(data.captured.length);
      Haptics.capture(data.captured.length);
    }

    if (data.atariGroups && data.atariGroups.length > 0) {
      Effects.atariRain(data.atariGroups);
    }

    Board3D.updateMarkers(lastMove, data.atariGroups);

    if (data.influence) updateInfluenceDisplay(data.influence);

    // Update captures from server data
    if (data.captures) {
      blackCaptures = data.captures[1] || data.captures['1'] || 0;
      whiteCaptures = data.captures[2] || data.captures['2'] || 0;
    }
    updateCaptureDisplay();
    updateStatus();
    updateControls();
  }

  function onPassed(data) {
    currentPlayer = data.currentPlayer;
    Sounds.pass();
    Haptics.pass();
    const who = data.color === 1 ? I18n.t('black') : I18n.t('white');
    setStatus(
      who + ' ' + I18n.t('passed') +
      (data.consecutivePasses === 1 ? ' ' + I18n.t('oneMoreToEnd') : '')
    );
    updateControls();
  }

  function onEnterScoring(data) {
    gameStatus = 'scoring';
    Board3D.setScoringMode(true);
    Board3D.updateTerritory(data.territory);
    showOverlay('scoring-overlay');
    updateScoreDisplay(data.result);
    updateControls();
  }

  function onScoringUpdate(data) {
    Board3D.setDeadStones(data.deadStones);
    Board3D.updateTerritory(data.territory);
    Board3D.updateMarkers(lastMove);
    updateScoreDisplay(data.score);
  }

  function onScoreConfirmedBy(data) {
    const who = data.color === myColor ? I18n.t('you') : I18n.t('opponent');
    setStatus(who + ' ' + I18n.t('confirmedScore'));
  }

  function onGameOver(data) {
    gameStatus = 'finished';
    Board3D.setScoringMode(false);
    hideOverlay('scoring-overlay');

    // winner is always numeric (1=BLACK, 2=WHITE) after game.js fix
    const won = data.winner === myColor;
    if (myRole === 'player') {
      if (won) {
        Sounds.gameWin();
        Haptics.gameOver(true);
        Effects.winEffect(boardSize);
      } else {
        Sounds.gameLose();
        Haptics.gameOver(false);
        Effects.loseEffect(boardSize);
      }
    }

    if (data.territory) Board3D.updateTerritory(data.territory);

    const titleEl = document.getElementById('gameover-title');
    const textEl = document.getElementById('gameover-text');
    const scoresEl = document.getElementById('gameover-scores');

    if (myRole === 'spectator') {
      titleEl.textContent = I18n.t('gameOver');
    } else {
      titleEl.textContent = won ? I18n.t('youWon') : I18n.t('youLost');
    }
    textEl.textContent = data.display || '';

    if (data.blackScore !== undefined) {
      scoresEl.innerHTML = `
        <div class="score-side black">
          <span class="score-label">${I18n.t('black')}</span>
          <span class="score-value">${data.blackScore.toFixed(1)}</span>
        </div>
        <div class="score-vs">${I18n.t('vs')}</div>
        <div class="score-side white">
          <span class="score-label">${I18n.t('white')}</span>
          <span class="score-value">${data.whiteScore.toFixed(1)}</span>
        </div>`;
    } else {
      scoresEl.innerHTML = '';
    }

    setTimeout(() => showOverlay('gameover-overlay'), 1500);
    updateControls();
  }

  function onRedoRequested(data) {
    if (data.by === myColor) {
      setStatus(I18n.t('redoRequested'));
    } else {
      showOverlay('redo-overlay');
      Haptics.redo();
      Sounds.redo();
    }
  }

  function onRedoAccepted(data) {
    hideOverlay('redo-overlay');
    setStatus(I18n.t('redoAccepted'));
    Sounds.redo();

    const g = data.game;
    board = g.board;
    currentPlayer = g.currentPlayer;
    blackCaptures = g.captures ? g.captures[1] || g.captures['1'] || 0 : 0;
    whiteCaptures = g.captures ? g.captures[2] || g.captures['2'] || 0 : 0;
    lastMove = null;
    if (g.moves && g.moves.length > 0) {
      const lm = g.moves[g.moves.length - 1];
      if (!lm.pass) lastMove = { x: lm.x, y: lm.y };
    }
    Board3D.syncBoard(board, { myColor, lastMove });
    updateCaptureDisplay();
    updateStatus();
    updateControls();
  }

  function onRedoRejected() {
    hideOverlay('redo-overlay');
    setStatus(I18n.t('redoDenied'));
    Sounds.error();
  }

  function onPlayerDisconnected(data) {
    if (data.color !== myColor) setStatus(I18n.t('opponentDisconnected'));
  }

  function onSpectatorCount() {}

  function onInfluenceUpdate(data) {
    updateInfluenceDisplay(data);
    if (showingInfluence && data.influence) {
      Board3D.updateInfluenceOverlay(data.influence);
    }
  }

  // ─── UI HELPERS ───
  function updatePlayerBars(players) {
    const selfBar = document.querySelector('.player-bar.self-bar');
    const oppBar = document.querySelector('.player-bar.opp-bar');

    if (myColor === 2) {
      oppBar.querySelector('.player-name').textContent = players.black ? players.black.name : '???';
      oppBar.classList.add('is-black');
      oppBar.classList.remove('is-white');
      selfBar.querySelector('.player-name').textContent = userName;
      selfBar.classList.add('is-white');
      selfBar.classList.remove('is-black');
    } else {
      selfBar.querySelector('.player-name').textContent = myRole === 'spectator' ? (players.black ? players.black.name : '???') : userName;
      selfBar.classList.add('is-black');
      selfBar.classList.remove('is-white');
      oppBar.querySelector('.player-name').textContent = players.white ? players.white.name : I18n.t('waiting');
      oppBar.classList.add('is-white');
      oppBar.classList.remove('is-black');
    }

    if (myRole === 'spectator') {
      selfBar.querySelector('.player-name').textContent = players.black ? players.black.name : I18n.t('black');
      oppBar.querySelector('.player-name').textContent = players.white ? players.white.name : I18n.t('white');
    }
  }

  function updateCaptureDisplay() {
    const selfBar = document.querySelector('.player-bar.self-bar .player-captures');
    const oppBar = document.querySelector('.player-bar.opp-bar .player-captures');
    if (!selfBar || !oppBar) return;

    if (myColor === 2) {
      selfBar.textContent = whiteCaptures;
      oppBar.textContent = blackCaptures;
    } else {
      selfBar.textContent = blackCaptures;
      oppBar.textContent = whiteCaptures;
    }
  }

  function updateStatus() {
    if (gameStatus === 'waiting') {
      setStatus(I18n.t('waitingForOpponent'));
    } else if (gameStatus === 'scoring') {
      setStatus(I18n.t('markDeadStones'));
    } else if (gameStatus === 'finished') {
      setStatus(I18n.t('gameOverStatus'));
    } else if (myRole === 'spectator') {
      setStatus(I18n.t('spectating') + ' \u2022 ' + (currentPlayer === 1 ? I18n.t('blacksTurn') : I18n.t('whitesTurn')));
    } else if (currentPlayer === myColor) {
      setStatus(I18n.t('yourTurn'));
    } else {
      setStatus(I18n.t('opponentsTurn'));
    }
  }

  function setStatus(text) {
    document.getElementById('game-status').textContent = text;
  }

  function updateControls() {
    const isMyTurn = myRole === 'player' && currentPlayer === myColor && gameStatus === 'active';
    document.getElementById('btn-pass').disabled = !isMyTurn;
    document.getElementById('btn-redo').disabled = !(myRole === 'player' && gameStatus === 'active');
    document.getElementById('btn-resign').disabled = !(myRole === 'player' && (gameStatus === 'active' || gameStatus === 'waiting'));
  }

  function updateScoreDisplay(score) {
    if (!score) return;
    document.getElementById('score-black').textContent = score.blackScore.toFixed(1);
    document.getElementById('score-white').textContent = score.whiteScore.toFixed(1);
  }

  function updateInfluenceDisplay(data) {
    const selfTerrEl = document.getElementById('self-territory');
    const oppTerrEl = document.getElementById('opp-territory');
    if (!data) return;
    let selfT, oppT;
    if (myColor === 1 || myRole === 'spectator') {
      selfT = data.blackTerritory;
      oppT = data.whiteTerritory;
    } else {
      selfT = data.whiteTerritory;
      oppT = data.blackTerritory;
    }
    if (selfTerrEl) selfTerrEl.textContent = '~' + Math.round(selfT);
    if (oppTerrEl) oppTerrEl.textContent = '~' + Math.round(oppT);
  }

  // ─── OVERLAYS ───
  function showOverlay(id) { document.getElementById(id).classList.remove('hidden'); }
  function hideOverlay(id) { document.getElementById(id).classList.add('hidden'); }
  function hideAllOverlays() { document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden')); }

  // ─── GAME CONTROLS ───
  function setupGameControls() {
    document.getElementById('btn-pass').addEventListener('click', () => {
      Haptics.buttonTap();
      if (tg) {
        tg.showConfirm(I18n.t('passConfirm'), (ok) => { if (ok) socket.emit('pass'); });
      } else {
        if (confirm(I18n.t('passConfirm'))) socket.emit('pass');
      }
    });

    document.getElementById('btn-redo').addEventListener('click', () => {
      Haptics.buttonTap();
      socket.emit('requestRedo');
    });

    document.getElementById('btn-resign').addEventListener('click', () => {
      Haptics.buttonTap();
      if (tg) {
        tg.showConfirm(I18n.t('resignConfirm'), (ok) => { if (ok) socket.emit('resign'); });
      } else {
        if (confirm(I18n.t('resignConfirm'))) socket.emit('resign');
      }
    });

    document.getElementById('btn-view').addEventListener('click', () => {
      Haptics.buttonTap();
      const is3d = Board3D.toggle3D();
      document.getElementById('btn-view').classList.toggle('active', is3d);
    });

    document.getElementById('btn-influence').addEventListener('click', () => {
      Haptics.buttonTap();
      showingInfluence = !showingInfluence;
      document.getElementById('btn-influence').classList.toggle('active', showingInfluence);
      Board3D.setShowInfluence(showingInfluence);
      if (showingInfluence && socket) {
        socket.emit('getInfluence');
      } else {
        Board3D.updateInfluenceOverlay(null);
      }
    });

    document.getElementById('btn-sound').addEventListener('click', () => {
      Haptics.buttonTap();
      const on = Sounds.toggle();
      document.getElementById('btn-sound').classList.toggle('active', !on);
    });

    document.getElementById('btn-accept-redo').addEventListener('click', () => {
      Haptics.buttonTap();
      socket.emit('acceptRedo');
      hideOverlay('redo-overlay');
    });

    document.getElementById('btn-reject-redo').addEventListener('click', () => {
      Haptics.buttonTap();
      socket.emit('rejectRedo');
      hideOverlay('redo-overlay');
    });

    document.getElementById('btn-confirm-score').addEventListener('click', () => {
      Haptics.buttonTap();
      socket.emit('confirmScore');
    });
  }

  // ─── EFFECTS LOOP ───
  function effectsLoop(now) {
    requestAnimationFrame(effectsLoop);
    const dt = Math.min(0.1, (now - effectsClock) / 1000);
    effectsClock = now;
    Effects.update(dt);
  }

  // ─── START ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
