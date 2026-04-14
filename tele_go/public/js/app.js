// Tele Go — Main application logic
(function () {
  'use strict';

  // ── Telegram WebApp ──
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
    try { tg.setHeaderColor('#1a1410'); } catch (e) {}
    try { tg.setBackgroundColor('#1a1410'); } catch (e) {}
  }

  // ── State ──
  let socket = null;
  let gameId = null;
  let myColor = null;    // 1 = BLACK, 2 = WHITE, null = spectator
  let myRole = 'spectator';
  let boardSize = 19;
  let board = [];
  let currentPlayer = 1;
  let gameOver = false;
  let aiSuggestion = null;
  let soundEnabled = true;
  let lastMoveData = null;
  let animationFrame = null;

  // ── Init ──
  function init() {
    // Parse game ID from URL
    const params = new URLSearchParams(window.location.search);
    gameId = params.get('game');

    if (gameId) {
      connectToGame(gameId);
      return;
    }

    // Check for active games before showing create UI
    const userId = getUserId();
    fetch(`/api/games/active?userId=${encodeURIComponent(userId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.games && data.games.length > 0) {
          showActiveGames(data.games);
        } else {
          showCreateGame();
        }
      })
      .catch(() => showCreateGame());
  }

  function showActiveGames(games) {
    const overlay = document.getElementById('waiting-overlay');
    overlay.querySelector('h3').textContent = 'Your Games';
    overlay.querySelector('p').textContent = 'You have active games in progress';

    const actions = overlay.querySelector('.overlay-actions');
    let html = '';
    for (const g of games) {
      const opponent = g.myColor === 'black'
        ? (g.players.white || 'Waiting...')
        : g.players.black;
      const isMyTurn = g.currentPlayer === (g.myColor === 'black' ? 1 : 2);
      const turnInfo = isMyTurn ? 'Your turn' : "Opponent's turn";
      html += `<button class="action-btn primary" onclick="TeleGo.resumeGame('${g.id}')">
        Continue ${g.size}×${g.size} vs ${opponent}<br>
        <small>Move ${g.moveCount} · ${turnInfo}</small>
      </button>`;
    }
    html += '<button class="action-btn" onclick="TeleGo.showNewGame()">New Game</button>';
    actions.innerHTML = html;
    overlay.style.display = 'flex';
  }

  function showCreateGame() {
    // If no game ID, show creation UI directly in waiting overlay
    const overlay = document.getElementById('waiting-overlay');
    overlay.querySelector('h3').textContent = 'Create a Game';
    overlay.querySelector('p').textContent = 'Choose board size to start';
    overlay.style.display = 'flex';

    const actions = overlay.querySelector('.overlay-actions');
    actions.innerHTML = `
      <button class="action-btn" onclick="TeleGo.createGame(9)">9×9</button>
      <button class="action-btn" onclick="TeleGo.createGame(13)">13×13</button>
      <button class="action-btn primary" onclick="TeleGo.createGame(19)">19×19</button>
    `;
  }

  window.TeleGo = {
    createGame(size) {
      const userId = getUserId();
      const userName = getUserName();
      fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size, komi: 6.5, userId, userName })
      })
        .then(r => r.json())
        .then(data => {
          gameId = data.id;
          history.replaceState(null, '', `?game=${gameId}`);
          document.getElementById('waiting-overlay').style.display = 'none';
          connectToGame(gameId);
        });
    },
    resumeGame(id) {
      gameId = id;
      history.replaceState(null, '', `?game=${gameId}`);
      document.getElementById('waiting-overlay').style.display = 'none';
      connectToGame(gameId);
    },
    showNewGame() {
      showCreateGame();
    }
  };

  // ── Connectivity ──
  function connectToGame(id) {
    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('join', {
        gameId: id,
        userId: getUserId(),
        userName: getUserName()
      });
    });

    socket.on('gameState', handleGameState);
    socket.on('movePlayed', handleMovePlayed);
    socket.on('passed', handlePassed);
    socket.on('gameOver', handleGameOver);
    socket.on('playerJoined', handlePlayerJoined);
    socket.on('playerDisconnected', handlePlayerDisconnected);
    socket.on('aiSuggestion', handleAISuggestion);
    socket.on('analysisResult', handleAnalysisResult);
    socket.on('aiJoined', handleAIJoined);
    socket.on('chat', handleChat);
    socket.on('error', handleError);
    socket.on('disconnect', () => {
      showToast('Disconnected — reconnecting...');
    });
    socket.on('reconnect', () => {
      socket.emit('join', { gameId: id, userId: getUserId(), userName: getUserName() });
      showToast('Reconnected!');
    });
  }

  // ── Game State ──
  function handleGameState(data) {
    boardSize = data.game.size;
    board = data.game.board;
    currentPlayer = data.game.currentPlayer;
    gameOver = data.game.gameOver;
    myColor = data.color;
    myRole = data.role;

    // Init board renderer
    const canvas = document.getElementById('board-canvas');
    BoardRenderer.init(canvas, boardSize);

    // Set up touch/mouse handlers
    setupInputHandlers(canvas);

    // Update UI
    updatePlayerInfo(data.players);
    updateStatus();
    updateControls();

    // Restore last move marker
    const moves = data.game.moves;
    if (moves.length > 0) {
      const last = moves[moves.length - 1];
      if (!last.pass) {
        lastMoveData = { x: last.x, y: last.y, color: last.color };
        BoardRenderer.setLastMove(lastMoveData);
      }
    }

    // Update captures
    updateCaptures(data.game.captures);

    // Show territory if game over
    if (gameOver && data.game.territory) {
      BoardRenderer.setTerritory(data.game.territory);
    }

    // Show waiting overlay if opponent not joined
    if (!data.players.white && !gameOver) {
      showWaitingOverlay();
    } else {
      document.getElementById('waiting-overlay').style.display = 'none';
    }

    // Start render loop
    startRenderLoop();

    // Handle game over state
    if (gameOver && data.game.result) {
      showGameOverOverlay(data.game.result);
    }
  }

  function handleMovePlayed(data) {
    const { x, y, color, captures, moveNumber, currentPlayer: cp, captureCount } = data;

    // Update board
    board[y][x] = color;
    currentPlayer = cp;

    // Animate stone placement
    Haptics.stonePlace();
    Sounds.stonePlace();
    BoardRenderer.animateStonePlacement(x, y, color);

    // Handle captures
    if (captures && captures.length > 0) {
      const captureList = captures.map(c => [c[0], c[1], board[c[1]]?.[c[0]] || (color === 1 ? 2 : 1)]);
      for (const c of captures) {
        board[c[1]][c[0]] = 0;
      }

      setTimeout(() => {
        Haptics.capture(captures.length);
        Sounds.capture(captures.length);
        BoardRenderer.animateCaptures(captureList);
      }, 100);
    }

    // Update last move
    lastMoveData = { x, y, color };
    BoardRenderer.setLastMove(lastMoveData);

    // Clear AI hints
    aiSuggestion = null;
    BoardRenderer.setHints([]);

    // Update captures display
    if (captureCount) updateCaptures(captureCount);

    updateStatus();
    updateControls();

    // Move counter
    document.getElementById('move-counter').textContent = `Move ${moveNumber}`;
  }

  function handlePassed(data) {
    currentPlayer = data.currentPlayer;
    Haptics.pass();
    Sounds.pass();

    const colorName = data.color === 1 ? 'Black' : 'White';
    showToast(`${colorName} passed${data.isAI ? ' (AI)' : ''}`);

    updateStatus();
    updateControls();
  }

  function handleGameOver(data) {
    gameOver = true;

    if (data.territory) {
      BoardRenderer.setTerritory(data.territory);
    }

    const won = data.result.winner === myColor;
    Haptics.gameOver(won);
    Sounds.gameOver(won);

    showGameOverOverlay(data.result, data.resigned);

    updateStatus();
    updateControls();
  }

  function handlePlayerJoined(data) {
    updatePlayerInfo(data.players);
    document.getElementById('waiting-overlay').style.display = 'none';

    if (data.role === 'player') {
      showToast(`${data.name || 'Player'} joined as ${data.color === 1 ? 'Black' : 'White'}`);
    } else {
      showToast(`Spectator joined (${data.spectatorCount} watching)`);
    }
  }

  function handlePlayerDisconnected(data) {
    if (data.color !== null) {
      const name = data.color === 1 ? 'Black' : 'White';
      showToast(`${name} disconnected`);
    }
  }

  function handleAISuggestion(data) {
    aiSuggestion = data;

    if (data.topMoves && data.topMoves.length > 0) {
      const hints = data.topMoves.slice(0, 3).map((m, i) => ({
        x: m.x,
        y: m.y,
        rank: i,
        winRate: m.winRate
      }));
      BoardRenderer.setHints(hints);
      Haptics.buttonTap();
      Sounds.hint();

      // Show AI overlay
      showAIOverlay(data);
    }
  }

  function handleAnalysisResult(data) {
    AnalysisUI.render(data);

    // Set analysis markers on board
    const markers = AnalysisUI.getMarkers(data);
    BoardRenderer.setAnalysisMarkers(markers);
  }

  function handleAIJoined(data) {
    updatePlayerInfo(data.players);
    document.getElementById('waiting-overlay').style.display = 'none';
    showToast(`AI (${data.difficulty}) joined!`);
  }

  function handleChat(data) {
    // Could show chat UI, for now just toast
    if (data.message) {
      showToast(`${data.name}: ${data.message}`);
    }
  }

  function handleError(data) {
    Haptics.error();
    Sounds.error();
    showToast(data.message || 'Error');
  }

  // ── Input Handling ──
  let touchStartPos = null;
  let touchStartTime = 0;
  let longPressTimer = null;
  let isLongPress = false;

  function setupInputHandlers(canvas) {
    // Touch events
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });

    // Mouse fallback
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    // Resize
    window.addEventListener('resize', () => {
      BoardRenderer.resize();
    });
  }

  function getCanvasCoords(e) {
    const el = document.getElementById('board-canvas');
    const rect = el.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] || e.changedTouches[0] : e;
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }

  function onTouchStart(e) {
    e.preventDefault();
    const coords = getCanvasCoords(e);
    const boardPoint = BoardRenderer.pixelToBoard(coords.x, coords.y);

    touchStartPos = coords;
    touchStartTime = Date.now();
    isLongPress = false;

    if (boardPoint) {
      BoardRenderer.setHover(boardPoint);
      Haptics.hover();

      // Show touch feedback
      showTouchFeedback(e.touches[0].clientX, e.touches[0].clientY);

      // Long press for preview
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        Haptics.buttonTap();
      }, 400);
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    clearTimeout(longPressTimer);

    const coords = getCanvasCoords(e);
    const boardPoint = BoardRenderer.pixelToBoard(coords.x, coords.y);

    if (boardPoint) {
      if (!BoardRenderer.hoverPoint ||
          boardPoint.x !== BoardRenderer.hoverPoint?.x ||
          boardPoint.y !== BoardRenderer.hoverPoint?.y) {
        Haptics.hover();
      }
      BoardRenderer.setHover(boardPoint);
      showTouchFeedback(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      BoardRenderer.setHover(null);
      hideTouchFeedback();
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    clearTimeout(longPressTimer);
    hideTouchFeedback();

    const coords = getCanvasCoords(e);
    const boardPoint = BoardRenderer.pixelToBoard(coords.x, coords.y);
    BoardRenderer.setHover(null);

    if (isLongPress || !boardPoint) return;

    // Quick tap — play move
    const elapsed = Date.now() - touchStartTime;
    if (elapsed < 500 && boardPoint) {
      playMove(boardPoint.x, boardPoint.y);
    }
  }

  function onTouchCancel(e) {
    clearTimeout(longPressTimer);
    BoardRenderer.setHover(null);
    hideTouchFeedback();
  }

  function onMouseDown(e) {
    const coords = getCanvasCoords(e);
    const boardPoint = BoardRenderer.pixelToBoard(coords.x, coords.y);
    if (boardPoint) {
      BoardRenderer.setHover(boardPoint);
    }
  }

  function onMouseMove(e) {
    const coords = getCanvasCoords(e);
    const boardPoint = BoardRenderer.pixelToBoard(coords.x, coords.y);
    BoardRenderer.setHover(boardPoint);
  }

  function onMouseUp(e) {
    const coords = getCanvasCoords(e);
    const boardPoint = BoardRenderer.pixelToBoard(coords.x, coords.y);
    BoardRenderer.setHover(null);

    if (boardPoint) {
      playMove(boardPoint.x, boardPoint.y);
    }
  }

  function onMouseLeave() {
    BoardRenderer.setHover(null);
  }

  function showTouchFeedback(clientX, clientY) {
    const fb = document.getElementById('touch-feedback');
    fb.style.left = clientX + 'px';
    fb.style.top = clientY + 'px';
    fb.classList.add('active');
  }

  function hideTouchFeedback() {
    document.getElementById('touch-feedback').classList.remove('active');
  }

  // ── Game Actions ──
  function playMove(x, y) {
    if (gameOver || myColor === null || currentPlayer !== myColor) {
      if (currentPlayer !== myColor && myColor !== null) {
        showToast('Not your turn');
        Haptics.error();
      }
      return;
    }

    // Check if position is empty
    if (board[y] && board[y][x] !== 0) {
      Haptics.error();
      Sounds.error();
      return;
    }

    socket.emit('move', { x, y });
  }

  function passMove() {
    if (gameOver || myColor === null || currentPlayer !== myColor) return;
    Haptics.buttonTap();
    Sounds.pass();
    socket.emit('pass');
  }

  function resign() {
    if (gameOver || myColor === null) return;
    showConfirm('Resign', 'Are you sure you want to resign?', () => {
      socket.emit('resign');
    });
  }

  function requestAIHint() {
    if (gameOver || myColor === null || currentPlayer !== myColor) return;
    Haptics.buttonTap();
    showToast('Thinking...');
    socket.emit('requestAISuggestion');
  }

  function requestAnalysis() {
    showToast('Analysis coming soon');
  }

  function addAIOpponent() {
    if (!socket) return;
    Haptics.buttonTap();
    socket.emit('enableAI', { difficulty: 'medium' });
  }

  function showInviteOverlay() {
    Haptics.buttonTap();
    const overlay = document.getElementById('invite-overlay');
    const linkInput = document.getElementById('invite-link');
    const baseUrl = window.location.origin;
    linkInput.value = `${baseUrl}?game=${gameId}`;
    overlay.style.display = 'flex';
  }

  // ── UI Updates ──
  function updatePlayerInfo(players) {
    const blackName = document.getElementById('black-name');
    const whiteName = document.getElementById('white-name');

    blackName.textContent = players.black?.name || 'Waiting...';
    whiteName.textContent = players.white?.name || 'Waiting...';

    // Highlight active player
    document.getElementById('player-black').classList.toggle('active', currentPlayer === 1);
    document.getElementById('player-white').classList.toggle('active', currentPlayer === 2);
  }

  function updateCaptures(captures) {
    document.getElementById('black-captures').textContent = captures[1] || 0;
    document.getElementById('white-captures').textContent = captures[2] || 0;
  }

  function updateStatus() {
    const badge = document.getElementById('game-status');
    badge.classList.remove('your-turn', 'gameover');

    if (gameOver) {
      badge.textContent = 'Game Over';
      badge.classList.add('gameover');
    } else if (myColor === null) {
      badge.textContent = 'Spectating';
    } else if (currentPlayer === myColor) {
      badge.textContent = 'Your Turn';
      badge.classList.add('your-turn');
    } else {
      badge.textContent = 'Opponent\'s Turn';
    }

    // Update active player highlight
    document.getElementById('player-black').classList.toggle('active', currentPlayer === 1 && !gameOver);
    document.getElementById('player-white').classList.toggle('active', currentPlayer === 2 && !gameOver);
  }

  function updateControls() {
    const isMyTurn = myColor !== null && currentPlayer === myColor && !gameOver;
    const isPlayer = myColor !== null;

    document.getElementById('btn-pass').disabled = !isMyTurn;
    document.getElementById('btn-ai').disabled = !isMyTurn;
    document.getElementById('btn-resign').disabled = !isPlayer || gameOver;

    // Analysis disabled for now
  }

  // ── Overlays ──
  function showGameOverOverlay(result, resigned) {
    const overlay = document.getElementById('gameover-overlay');
    const icon = document.getElementById('gameover-icon');
    const title = document.getElementById('gameover-title');
    const detail = document.getElementById('gameover-detail');

    const won = result.winner === myColor;
    const winnerName = result.winner === 1 ? 'Black' : 'White';

    if (myColor === null) {
      icon.textContent = result.winner === 1 ? '⚫' : '⚪';
      title.textContent = `${winnerName} Wins!`;
    } else if (won) {
      icon.textContent = '🏆';
      title.textContent = 'You Win!';
    } else {
      icon.textContent = '💫';
      title.textContent = 'You Lost';
    }

    if (result.method === 'resignation') {
      const loser = resigned === 1 ? 'Black' : 'White';
      detail.textContent = `${loser} resigned`;
    } else if (result.display) {
      detail.textContent = result.display;
    } else {
      detail.textContent = `${winnerName} wins by ${result.score || 0} points`;
    }

    overlay.style.display = 'flex';
  }

  function showAIOverlay(data) {
    const overlay = document.getElementById('ai-overlay');
    const info = document.getElementById('ai-info');

    const letters = 'ABCDEFGHJKLMNOPQRST';
    let html = '<div style="margin-bottom:12px">';

    if (data.topMoves) {
      for (let i = 0; i < Math.min(3, data.topMoves.length); i++) {
        const m = data.topMoves[i];
        const coord = `${letters[m.x]}${boardSize - m.y}`;
        const label = String.fromCharCode(65 + i);
        const isTop = i === 0;
        html += `<div style="
          display:flex;align-items:center;gap:8px;padding:8px;
          border-radius:8px;margin-bottom:4px;
          background:${isTop ? 'rgba(68,170,136,0.15)' : 'rgba(255,255,255,0.05)'}">
          <span style="font-weight:700;color:${isTop ? '#4a8' : '#888'};width:20px">${label}</span>
          <span style="font-weight:600">${coord}</span>
          <span style="color:#9a8e7e;font-size:12px;margin-left:auto">${m.winRate}% win rate</span>
        </div>`;
      }
    }

    html += '</div>';
    info.innerHTML = html;
    overlay.style.display = 'flex';

    // Auto-play button
    document.getElementById('ai-play-btn').onclick = () => {
      if (data.move) {
        playMove(data.move.x, data.move.y);
      }
      overlay.style.display = 'none';
      BoardRenderer.setHints([]);
    };
  }

  function showWaitingOverlay() {
    const overlay = document.getElementById('waiting-overlay');
    overlay.querySelector('h3').textContent = 'Waiting for opponent';
    overlay.querySelector('p').textContent = 'Share the invite link or add an AI opponent';

    const baseUrl = window.location.origin;
    const inviteLink = `${baseUrl}?game=${gameId}`;

    const actions = overlay.querySelector('.overlay-actions');
    actions.innerHTML = `
      <div class="invite-link-box">
        <input id="waiting-invite-link" type="text" readonly value="${inviteLink}">
        <button id="waiting-copy-link" class="action-btn small">Copy</button>
      </div>
      <button id="waiting-share-tg" class="action-btn primary">Send via Telegram</button>
      <button id="waiting-ai" class="action-btn">Play vs AI</button>
    `;

    document.getElementById('waiting-copy-link').onclick = () => {
      const input = document.getElementById('waiting-invite-link');
      input.select();
      navigator.clipboard?.writeText(input.value)
        .then(() => showToast('Link copied!'))
        .catch(() => {
          document.execCommand('copy');
          showToast('Link copied!');
        });
    };

    document.getElementById('waiting-share-tg').onclick = () => {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('Join my Go game!')}`;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, '_blank');
      }
    };

    document.getElementById('waiting-ai').onclick = addAIOpponent;

    overlay.style.display = 'flex';
  }

  function showConfirm(title, message, onConfirm) {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;

    document.getElementById('confirm-yes').onclick = () => {
      overlay.style.display = 'none';
      onConfirm();
    };
    document.getElementById('confirm-no').onclick = () => {
      overlay.style.display = 'none';
    };

    overlay.style.display = 'flex';
  }

  // ── Toast ──
  let toastTimer = null;
  function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ── Render Loop ──
  function startRenderLoop() {
    function frame() {
      BoardRenderer.draw(board, currentPlayer, myColor);
      animationFrame = requestAnimationFrame(frame);
    }
    if (animationFrame) cancelAnimationFrame(animationFrame);
    frame();
  }

  // ── Helpers ──
  function getUserId() {
    if (tg?.initDataUnsafe?.user?.id) return String(tg.initDataUnsafe.user.id);
    let id = localStorage.getItem('tele_go_user_id');
    if (!id) {
      id = 'web_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('tele_go_user_id', id);
    }
    return id;
  }

  function getUserName() {
    if (tg?.initDataUnsafe?.user?.first_name) return tg.initDataUnsafe.user.first_name;
    return 'Player';
  }

  // ── Wire up buttons ──
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-pass').addEventListener('click', passMove);
    document.getElementById('btn-ai').addEventListener('click', requestAIHint);
    document.getElementById('btn-resign').addEventListener('click', resign);
    document.getElementById('btn-invite').addEventListener('click', showInviteOverlay);
    document.getElementById('btn-ai-play').addEventListener('click', addAIOpponent);
    document.getElementById('btn-analyze').addEventListener('click', requestAnalysis);

    // Sound toggle
    document.getElementById('btn-sound').addEventListener('click', () => {
      const soundOn = Sounds.toggle();
      Haptics.toggle();
      showToast(soundOn ? 'Sound & haptics on' : 'Sound & haptics off');
    });

    // Close overlays
    document.getElementById('ai-close-btn').addEventListener('click', () => {
      document.getElementById('ai-overlay').style.display = 'none';
      BoardRenderer.setHints([]);
    });

    document.getElementById('analysis-close').addEventListener('click', () => {
      document.getElementById('analysis-overlay').style.display = 'none';
      BoardRenderer.setAnalysisMarkers([]);
    });

    document.getElementById('gameover-analyze').addEventListener('click', () => {
      document.getElementById('gameover-overlay').style.display = 'none';
      requestAnalysis();
    });

    document.getElementById('gameover-newgame').addEventListener('click', () => {
      window.location.href = '/';
    });

    document.getElementById('invite-close').addEventListener('click', () => {
      document.getElementById('invite-overlay').style.display = 'none';
    });

    document.getElementById('copy-link').addEventListener('click', () => {
      const input = document.getElementById('invite-link');
      input.select();
      navigator.clipboard?.writeText(input.value)
        .then(() => showToast('Link copied!'))
        .catch(() => {
          document.execCommand('copy');
          showToast('Link copied!');
        });
    });

    document.getElementById('invite-telegram').addEventListener('click', () => {
      const link = document.getElementById('invite-link').value;
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join my Go game!')}`;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, '_blank');
      }
      document.getElementById('invite-overlay').style.display = 'none';
    });

    // Init audio context on first interaction
    document.addEventListener('touchstart', () => Sounds.ensureContext(), { once: true });
    document.addEventListener('click', () => Sounds.ensureContext(), { once: true });

    // Start app
    init();
  });
})();
