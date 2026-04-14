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
  let myColor = null; // 1=BLACK, 2=WHITE, null=spectator
  let myRole = null;  // 'player' | 'spectator'
  let gameId = null;
  let boardSize = 19;
  let board = null;
  let currentPlayer = 1;
  let gameStatus = 'lobby'; // lobby | waiting | active | scoring | finished
  let lastMove = null;
  let showingInfluence = false;
  let effectsClock = performance.now();
  let userId = null;
  let userName = null;

  // Navigation stack for back button
  const navStack = [];

  // ─── INIT ───
  function init() {
    // Get user info from Telegram
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      userId = String(tg.initDataUnsafe.user.id);
      userName = tg.initDataUnsafe.user.first_name || 'Player';
    } else {
      userId = 'dev_' + Math.random().toString(36).slice(2, 8);
      userName = 'Dev';
    }

    // Check URL for game param
    const params = new URLSearchParams(window.location.search);
    gameId = params.get('game') || params.get('tgWebAppStartParam');

    // Also check Telegram start param
    if (!gameId && tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
      gameId = tg.initDataUnsafe.start_param;
    }

    setupNavigation();
    setupTabs();
    setupGameControls();

    if (gameId) {
      navigateTo('game');
      connectToGame(gameId);
    } else {
      navigateTo('lobby');
      loadMyGames();
      loadPublicGames();
    }

    // Effects update loop
    requestAnimationFrame(effectsLoop);
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
    if (navStack.length > 0 || gameId) {
      tg.BackButton.show();
    } else {
      tg.BackButton.hide();
    }
  }

  function setupNavigation() {
    if (tg && tg.BackButton) {
      tg.BackButton.onClick(goBack);
    }
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
      el.innerHTML = `<div class="empty-state">${isMine ? 'No games yet. Create one from the bot!' : 'No public games right now.'}</div>`;
      return;
    }
    el.innerHTML = games.map(g => {
      const black = g.players.black || '???';
      const white = g.players.white || 'Waiting...';
      const statusCls = g.status === 'active' ? 'active' : g.status === 'waiting' ? 'waiting' : 'finished';
      const statusText = g.status === 'active' ? 'Live' : g.status === 'waiting' ? 'Open' : 'Done';
      return `
        <div class="game-card" data-id="${g.id}">
          <div class="game-card-board">${g.size}</div>
          <div class="game-card-info">
            <div class="game-card-players">${esc(black)} vs ${esc(white)}</div>
            <div class="game-card-meta">Move ${g.moveCount} &middot; ${g.spectatorCount} watching</div>
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
    socket.on('error', (data) => {
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

    // Init Three.js board
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
      if (board[y][x] !== 0) {
        socket.emit('toggleDead', { x, y });
      }
    };

    // Find last move
    lastMove = null;
    if (g.moves && g.moves.length > 0) {
      const lm = g.moves[g.moves.length - 1];
      if (!lm.pass) lastMove = { x: lm.x, y: lm.y };
    }

    Board3D.syncBoard(board, { myColor, lastMove });

    // Update UI
    updatePlayerBars(data.players);
    updateStatus();
    updateControls();

    // Handle overlay
    if (data.status === 'waiting') {
      showOverlay('waiting-overlay');
    } else {
      hideAllOverlays();
      Board3D.playEntranceAnimation();
      if (g.moveCount === 0) {
        Sounds.gameStart();
        Effects.startRipple(boardSize);
      }
    }

    // Request initial influence
    if (g.moveCount > 0) socket.emit('getInfluence');

    window.addEventListener('resize', () => Board3D.resize());
  }

  function onPlayerJoined(data) {
    hideOverlay('waiting-overlay');
    gameStatus = data.status || 'active';
    updateStatus();
    Sounds.gameStart();
    Effects.startRipple(boardSize);
    Board3D.playEntranceAnimation();

    // Refresh player bars
    const oppName = data.name || 'Opponent';
    const oppBar = document.querySelector('.player-bar.opponent .player-name');
    if (oppBar) oppBar.textContent = oppName;
  }

  function onMovePlayed(data) {
    board[data.y][data.x] = data.color;
    currentPlayer = data.currentPlayer;
    lastMove = { x: data.x, y: data.y };

    // Place stone with animation
    Board3D.addStone(data.x, data.y, data.color, true);
    Effects.placeRipple(data.x, data.y, data.color);
    Sounds.stonePlace();
    Haptics.stonePlace();

    // Handle captures
    if (data.captured && data.captured.length > 0) {
      for (const [cx, cy] of data.captured) {
        board[cy][cx] = 0;
        Board3D.removeStone(cx, cy, true);
      }
      Effects.captureEffect(data.captured, data.color === 1 ? 2 : 1);
      Sounds.capture(data.captured.length);
      Haptics.capture(data.captured.length);
    }

    // Atari effects
    if (data.atariGroups && data.atariGroups.length > 0) {
      Effects.atariRain(data.atariGroups);
    }

    Board3D.updateMarkers(lastMove, data.atariGroups);

    // Update influence
    if (data.influence) {
      updateInfluenceDisplay(data.influence);
    }

    updateCaptures(data);
    updateStatus();
    updateControls();
  }

  function onPassed(data) {
    currentPlayer = data.currentPlayer;
    Sounds.pass();
    Haptics.pass();
    setStatus(
      (data.color === 1 ? 'Black' : 'White') + ' passed' +
      (data.consecutivePasses === 1 ? ' (1 more to end)' : '')
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
    const who = data.color === myColor ? 'You' : 'Opponent';
    setStatus(who + ' confirmed the score');
  }

  function onGameOver(data) {
    gameStatus = 'finished';
    Board3D.setScoringMode(false);
    hideOverlay('scoring-overlay');

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

    // Show territory if available
    if (data.territory) {
      Board3D.updateTerritory(data.territory);
    }

    // Game over overlay
    const titleEl = document.getElementById('gameover-title');
    const textEl = document.getElementById('gameover-text');
    const scoresEl = document.getElementById('gameover-scores');

    if (myRole === 'spectator') {
      titleEl.textContent = 'Game Over';
    } else {
      titleEl.textContent = won ? 'You Won!' : 'You Lost';
    }
    textEl.textContent = data.display || '';

    if (data.blackScore !== undefined) {
      scoresEl.innerHTML = `
        <div class="score-side black">
          <span class="score-label">Black</span>
          <span class="score-value">${data.blackScore.toFixed(1)}</span>
        </div>
        <div class="score-vs">vs</div>
        <div class="score-side white">
          <span class="score-label">White</span>
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
      setStatus('Redo requested...');
    } else {
      showOverlay('redo-overlay');
      Haptics.redo();
      Sounds.redo();
    }
  }

  function onRedoAccepted(data) {
    hideOverlay('redo-overlay');
    setStatus('Redo accepted');
    Sounds.redo();

    // Full board resync
    const g = data.game;
    board = g.board;
    currentPlayer = g.currentPlayer;
    lastMove = null;
    if (g.moves && g.moves.length > 0) {
      const lm = g.moves[g.moves.length - 1];
      if (!lm.pass) lastMove = { x: lm.x, y: lm.y };
    }
    Board3D.syncBoard(board, { myColor, lastMove });
    updateStatus();
    updateControls();
  }

  function onRedoRejected() {
    hideOverlay('redo-overlay');
    setStatus('Redo denied');
    Sounds.error();
  }

  function onPlayerDisconnected(data) {
    const who = data.color === myColor ? 'You' : 'Opponent';
    if (who === 'Opponent') setStatus('Opponent disconnected');
  }

  function onSpectatorCount(count) {
    // Could show in UI if desired
  }

  function onInfluenceUpdate(data) {
    updateInfluenceDisplay(data);
    if (showingInfluence && data.influence) {
      Board3D.updateInfluenceOverlay(data.influence);
    }
  }

  // ─── UI HELPERS ───
  function updatePlayerBars(players) {
    const oppBar = document.querySelector('.player-bar.opponent');
    const selfBar = document.querySelector('.player-bar.self');

    if (myColor === 2) {
      // I'm white, opponent is black
      oppBar.querySelector('.player-name').textContent = players.black ? players.black.name : '???';
      oppBar.classList.add('is-black');
      oppBar.classList.remove('is-white');
      selfBar.querySelector('.player-name').textContent = userName;
      selfBar.classList.add('is-white');
      selfBar.classList.remove('is-black');
    } else {
      // I'm black or spectator
      selfBar.querySelector('.player-name').textContent = myRole === 'spectator' ? (players.black ? players.black.name : '???') : userName;
      selfBar.classList.add('is-black');
      selfBar.classList.remove('is-white');
      oppBar.querySelector('.player-name').textContent = players.white ? players.white.name : 'Waiting...';
      oppBar.classList.add('is-white');
      oppBar.classList.remove('is-black');
    }

    if (myRole === 'spectator') {
      selfBar.querySelector('.player-name').textContent = players.black ? players.black.name : 'Black';
      oppBar.querySelector('.player-name').textContent = players.white ? players.white.name : 'White';
    }
  }

  function updateCaptures(data) {
    // Update capture counts from board state
    // We track via movePlayed events
  }

  function updateStatus() {
    if (gameStatus === 'waiting') {
      setStatus('Waiting for opponent...');
    } else if (gameStatus === 'scoring') {
      setStatus('Mark dead stones');
    } else if (gameStatus === 'finished') {
      setStatus('Game over');
    } else if (myRole === 'spectator') {
      setStatus('Spectating \u2022 ' + (currentPlayer === 1 ? 'Black' : 'White') + "'s turn");
    } else if (currentPlayer === myColor) {
      setStatus('Your turn');
    } else {
      setStatus("Opponent's turn");
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
  function showOverlay(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function hideOverlay(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function hideAllOverlays() {
    document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
  }

  // ─── GAME CONTROLS ───
  function setupGameControls() {
    document.getElementById('btn-pass').addEventListener('click', () => {
      Haptics.buttonTap();
      if (tg) {
        tg.showConfirm('Pass your turn?', (ok) => { if (ok) socket.emit('pass'); });
      } else {
        if (confirm('Pass your turn?')) socket.emit('pass');
      }
    });

    document.getElementById('btn-redo').addEventListener('click', () => {
      Haptics.buttonTap();
      socket.emit('requestRedo');
    });

    document.getElementById('btn-resign').addEventListener('click', () => {
      Haptics.buttonTap();
      if (tg) {
        tg.showConfirm('Are you sure you want to resign?', (ok) => { if (ok) socket.emit('resign'); });
      } else {
        if (confirm('Resign?')) socket.emit('resign');
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
