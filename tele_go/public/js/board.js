// Board Renderer — Canvas-based Go board with tactile feel
// Wood grain texture, realistic stones, smooth animations

const BoardRenderer = (() => {
  let canvas, ctx;
  let boardSize = 19;
  let cellSize = 0;
  let padding = 0;
  let boardOffset = { x: 0, y: 0 };
  let stones = [];          // [{x, y, color, anim}]
  let lastMove = null;
  let hoverPoint = null;
  let hintPoints = [];       // AI suggestion markers
  let territoryMap = null;
  let analysisMarkers = [];  // {x, y, quality}
  let animatingStones = [];  // stones being placed (animated)
  let captureAnimations = []; // stones being captured (shrink out)
  let boardState = null;     // 2D array reference

  // Wood grain cache
  let woodPattern = null;

  function init(canvasEl, size) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    boardSize = size || 19;
    resize();
    generateWoodPattern();
  }

  function resize() {
    const wrap = canvas.parentElement;
    const maxW = wrap.clientWidth - 16;
    const maxH = wrap.clientHeight - 16;
    const dim = Math.min(maxW, maxH);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = dim * dpr;
    canvas.height = dim * dpr;
    canvas.style.width = dim + 'px';
    canvas.style.height = dim + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    padding = dim * 0.04;
    cellSize = (dim - padding * 2) / (boardSize - 1);
    boardOffset = { x: padding, y: padding };

    generateWoodPattern();
  }

  function generateWoodPattern() {
    // Create wood grain texture on offscreen canvas
    const w = canvas.width;
    const h = canvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d');

    // Base wood color
    octx.fillStyle = '#d4a855';
    octx.fillRect(0, 0, w, h);

    // Grain lines
    octx.globalAlpha = 0.08;
    for (let i = 0; i < 60; i++) {
      const y = Math.random() * h;
      const curve = Math.random() * 8 - 4;
      octx.beginPath();
      octx.moveTo(0, y);
      octx.bezierCurveTo(w * 0.3, y + curve, w * 0.7, y - curve, w, y + curve * 0.5);
      octx.strokeStyle = Math.random() > 0.5 ? '#8a6020' : '#c49838';
      octx.lineWidth = Math.random() * 2 + 0.5;
      octx.stroke();
    }

    // Subtle noise
    octx.globalAlpha = 0.03;
    for (let i = 0; i < 2000; i++) {
      octx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
      octx.fillRect(
        Math.random() * w,
        Math.random() * h,
        Math.random() * 2 + 1,
        Math.random() * 2 + 1
      );
    }

    octx.globalAlpha = 1;
    woodPattern = offscreen;
  }

  function boardToPixel(bx, by) {
    return {
      x: boardOffset.x + bx * cellSize,
      y: boardOffset.y + by * cellSize
    };
  }

  function pixelToBoard(px, py) {
    const bx = Math.round((px - boardOffset.x) / cellSize);
    const by = Math.round((py - boardOffset.y) / cellSize);
    if (bx < 0 || bx >= boardSize || by < 0 || by >= boardSize) return null;
    return { x: bx, y: by };
  }

  function draw(board, currentPlayer, myColor) {
    boardState = board;
    const dim = parseInt(canvas.style.width);

    ctx.clearRect(0, 0, dim, dim);

    // Draw wood background
    if (woodPattern) {
      ctx.drawImage(woodPattern, 0, 0, dim, dim);
    } else {
      ctx.fillStyle = '#d4a855';
      ctx.fillRect(0, 0, dim, dim);
    }

    // Board edge shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = '#8a6020';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, dim - 1, dim - 1);
    ctx.restore();

    drawGrid(dim);
    drawStarPoints();
    drawCoordinates(dim);

    // Territory overlay
    if (territoryMap) {
      drawTerritory();
    }

    // Stones
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (board[y][x] !== 0) {
          const isAnimating = animatingStones.some(s => s.x === x && s.y === y);
          if (!isAnimating) {
            drawStone(x, y, board[y][x], 1);
          }
        }
      }
    }

    // Animating stones (being placed)
    for (const anim of animatingStones) {
      drawStone(anim.x, anim.y, anim.color, anim.scale);
    }

    // Capture animations
    for (const anim of captureAnimations) {
      drawStone(anim.x, anim.y, anim.color, anim.scale, anim.alpha);
    }

    // Last move marker
    if (lastMove) {
      drawLastMoveMarker(lastMove.x, lastMove.y, lastMove.color);
    }

    // AI hint markers
    for (const hint of hintPoints) {
      drawHintMarker(hint.x, hint.y, hint.rank, hint.winRate);
    }

    // Analysis markers
    for (const marker of analysisMarkers) {
      drawAnalysisMarker(marker.x, marker.y, marker.quality);
    }

    // Hover preview
    if (hoverPoint && (!board[hoverPoint.y] || board[hoverPoint.y][hoverPoint.x] === 0)) {
      drawGhostStone(hoverPoint.x, hoverPoint.y, currentPlayer);
    }
  }

  function drawGrid(dim) {
    ctx.strokeStyle = '#5a4a2e';
    ctx.lineWidth = 0.8;

    for (let i = 0; i < boardSize; i++) {
      const p = boardOffset.x + i * cellSize;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(p, boardOffset.y);
      ctx.lineTo(p, boardOffset.y + (boardSize - 1) * cellSize);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(boardOffset.x, p);
      ctx.lineTo(boardOffset.x + (boardSize - 1) * cellSize, p);
      ctx.stroke();
    }

    // Thicker border
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      boardOffset.x, boardOffset.y,
      (boardSize - 1) * cellSize,
      (boardSize - 1) * cellSize
    );
  }

  function drawStarPoints() {
    const stars = {
      9: [2, 4, 6],
      13: [3, 6, 9],
      19: [3, 9, 15]
    };
    const pts = stars[boardSize] || [];

    ctx.fillStyle = '#4a3c26';
    for (const x of pts) {
      for (const y of pts) {
        const p = boardToPixel(x, y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, cellSize * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawCoordinates(dim) {
    ctx.fillStyle = 'rgba(90, 74, 46, 0.5)';
    ctx.font = `${Math.max(8, cellSize * 0.28)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const letters = 'ABCDEFGHJKLMNOPQRST'; // I is skipped in Go
    for (let i = 0; i < boardSize; i++) {
      const p = boardToPixel(i, 0);
      // Top
      ctx.fillText(letters[i], p.x, boardOffset.y - cellSize * 0.45);
      // Bottom
      ctx.fillText(letters[i], p.x, boardOffset.y + (boardSize - 1) * cellSize + cellSize * 0.45);
    }

    ctx.textAlign = 'center';
    for (let i = 0; i < boardSize; i++) {
      const num = boardSize - i;
      const p = boardToPixel(0, i);
      // Left
      ctx.fillText(num, boardOffset.x - cellSize * 0.55, p.y);
      // Right
      ctx.fillText(num, boardOffset.x + (boardSize - 1) * cellSize + cellSize * 0.55, p.y);
    }
  }

  function drawStone(bx, by, color, scale = 1, alpha = 1) {
    const p = boardToPixel(bx, by);
    const r = cellSize * 0.44 * scale;
    if (r <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = cellSize * 0.15;
    ctx.shadowOffsetX = cellSize * 0.04;
    ctx.shadowOffsetY = cellSize * 0.06;

    if (color === 1) {
      // Black stone — subtle radial gradient
      const grad = ctx.createRadialGradient(
        p.x - r * 0.3, p.y - r * 0.3, r * 0.05,
        p.x, p.y, r
      );
      grad.addColorStop(0, '#4a4a4a');
      grad.addColorStop(0.5, '#2a2a2a');
      grad.addColorStop(1, '#111');
      ctx.fillStyle = grad;
    } else {
      // White stone — glossy
      const grad = ctx.createRadialGradient(
        p.x - r * 0.3, p.y - r * 0.3, r * 0.05,
        p.x, p.y, r
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, '#f4f0e8');
      grad.addColorStop(1, '#d8d4c8');
      ctx.fillStyle = grad;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.shadowColor = 'transparent';
    const specGrad = ctx.createRadialGradient(
      p.x - r * 0.25, p.y - r * 0.3, 0,
      p.x - r * 0.25, p.y - r * 0.3, r * 0.5
    );
    specGrad.addColorStop(0, color === 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.4)');
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawGhostStone(bx, by, color) {
    const p = boardToPixel(bx, by);
    const r = cellSize * 0.44;

    ctx.save();
    ctx.globalAlpha = 0.35;

    if (color === 1) {
      ctx.fillStyle = '#333';
    } else {
      ctx.fillStyle = '#e0dcd4';
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLastMoveMarker(bx, by, color) {
    const p = boardToPixel(bx, by);
    const r = cellSize * 0.16;

    ctx.save();
    ctx.strokeStyle = color === 1 ? '#d4a855' : '#d4a855';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHintMarker(bx, by, rank, winRate) {
    const p = boardToPixel(bx, by);
    const r = cellSize * 0.38;

    ctx.save();

    // Circle
    ctx.globalAlpha = rank === 0 ? 0.6 : 0.3;
    ctx.fillStyle = rank === 0 ? '#4a8' : '#888';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${cellSize * 0.28}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (rank === 0) {
      ctx.fillText('A', p.x, p.y);
    } else {
      ctx.fillText(String.fromCharCode(65 + rank), p.x, p.y);
    }

    ctx.restore();
  }

  function drawAnalysisMarker(bx, by, quality) {
    const p = boardToPixel(bx, by);
    const r = cellSize * 0.22;

    ctx.save();
    const colors = {
      excellent: '#4a8',
      good: '#6a6',
      neutral: 'transparent',
      mistake: '#c44'
    };

    if (quality === 'neutral') { ctx.restore(); return; }

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = colors[quality] || 'transparent';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTerritory() {
    if (!territoryMap) return;

    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (territoryMap[y][x] === 0) continue;
        if (boardState && boardState[y][x] !== 0) continue;

        const p = boardToPixel(x, y);
        const s = cellSize * 0.2;

        ctx.save();
        ctx.globalAlpha = 0.6;

        if (territoryMap[y][x] === 1) {
          ctx.fillStyle = '#222';
        } else {
          ctx.fillStyle = '#eee';
        }

        ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
        ctx.restore();
      }
    }
  }

  // Animations
  function animateStonePlacement(x, y, color, callback) {
    const anim = { x, y, color, scale: 0, startTime: performance.now() };
    animatingStones.push(anim);

    function animate(time) {
      const elapsed = time - anim.startTime;
      const duration = 180;
      const progress = Math.min(elapsed / duration, 1);

      // Elastic ease-out
      const c4 = (2 * Math.PI) / 3;
      anim.scale = progress === 1
        ? 1
        : Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * c4) + 1;

      if (progress >= 1) {
        anim.scale = 1;
        animatingStones = animatingStones.filter(a => a !== anim);
        if (callback) callback();
        return;
      }

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }

  function animateCaptures(captures, callback) {
    if (captures.length === 0) { if (callback) callback(); return; }

    const startTime = performance.now();
    const anims = captures.map(([x, y, color]) => ({
      x, y, color: color || (boardState && boardState[y] ? boardState[y][x] : 2),
      scale: 1, alpha: 1
    }));
    captureAnimations.push(...anims);

    function animate(time) {
      const elapsed = time - startTime;
      const duration = 250;
      const progress = Math.min(elapsed / duration, 1);

      for (const a of anims) {
        a.scale = 1 - progress * 0.5;
        a.alpha = 1 - progress;
      }

      if (progress >= 1) {
        captureAnimations = captureAnimations.filter(a => !anims.includes(a));
        if (callback) callback();
        return;
      }

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }

  function setHover(point) {
    hoverPoint = point;
  }

  function setLastMove(move) {
    lastMove = move;
  }

  function setHints(hints) {
    hintPoints = hints || [];
  }

  function setTerritory(territory) {
    territoryMap = territory;
  }

  function setAnalysisMarkers(markers) {
    analysisMarkers = markers || [];
  }

  function clearOverlays() {
    hintPoints = [];
    analysisMarkers = [];
    territoryMap = null;
  }

  return {
    init,
    resize,
    draw,
    drawStone,
    pixelToBoard,
    boardToPixel,
    setHover,
    setLastMove,
    setHints,
    setTerritory,
    setAnalysisMarkers,
    clearOverlays,
    animateStonePlacement,
    animateCaptures,
    get cellSize() { return cellSize; },
    get padding() { return padding; }
  };
})();
