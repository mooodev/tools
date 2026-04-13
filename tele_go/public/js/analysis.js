// Analysis UI — renders game analysis results
const AnalysisUI = (() => {

  function render(analysis, container) {
    const summary = analysis.summary;
    const summaryEl = document.getElementById('analysis-summary');
    const mistakesEl = document.getElementById('analysis-mistakes');
    const chartCanvas = document.getElementById('score-chart');

    // Summary stats
    const result = summary.result;
    summaryEl.innerHTML = `
      <div class="analysis-stat">
        <div class="label">Moves</div>
        <div class="value">${summary.totalMoves}</div>
      </div>
      <div class="analysis-stat">
        <div class="label">Result</div>
        <div class="value">${result ? result.display || (result.method === 'resignation' ? 'Resign' : '?') : '?'}</div>
      </div>
      <div class="analysis-stat">
        <div class="label">Captures (B)</div>
        <div class="value">${summary.captures[1] || 0}</div>
      </div>
      <div class="analysis-stat">
        <div class="label">Captures (W)</div>
        <div class="value">${summary.captures[2] || 0}</div>
      </div>
      <div class="analysis-stat">
        <div class="label">Mistakes (B)</div>
        <div class="value" style="color:#e88">${analysis.mistakes.filter(m => m.color === 1).length}</div>
      </div>
      <div class="analysis-stat">
        <div class="label">Mistakes (W)</div>
        <div class="value" style="color:#e88">${analysis.mistakes.filter(m => m.color === 2).length}</div>
      </div>
      <div class="analysis-stat">
        <div class="label">Good Moves (B)</div>
        <div class="value" style="color:#4a8">${analysis.goodMoves.filter(m => m.color === 1).length}</div>
      </div>
      <div class="analysis-stat">
        <div class="label">Good Moves (W)</div>
        <div class="value" style="color:#4a8">${analysis.goodMoves.filter(m => m.color === 2).length}</div>
      </div>
    `;

    // Score progression chart
    drawScoreChart(chartCanvas, analysis.scoreProgression);

    // Mistakes list
    let mistakesHtml = '';
    if (analysis.mistakes.length > 0) {
      mistakesHtml += '<h4 style="color:#e88;margin-bottom:8px;font-size:13px">Key Mistakes</h4>';
      for (const m of analysis.mistakes.slice(0, 8)) {
        const colorClass = m.color === 1 ? 'black' : 'white';
        const letters = 'ABCDEFGHJKLMNOPQRST';
        const coord = `${letters[m.played.x]}${19 - m.played.y}`;
        const sugCoord = m.suggested ? `${letters[m.suggested.x]}${19 - m.suggested.y}` : '?';

        mistakesHtml += `
          <div class="mistake-item">
            <span class="move-number-badge ${colorClass}">${m.moveNumber}</span>
            <span>Played ${coord} — better: ${sugCoord} (${m.scoreLoss.toFixed(1)} pts)</span>
          </div>
        `;
      }
    }

    if (analysis.goodMoves.length > 0) {
      mistakesHtml += '<h4 style="color:#4a8;margin:12px 0 8px;font-size:13px">Excellent Moves</h4>';
      for (const m of analysis.goodMoves.slice(0, 5)) {
        const colorClass = m.color === 1 ? 'black' : 'white';
        const letters = 'ABCDEFGHJKLMNOPQRST';
        const coord = `${letters[m.move.x]}${19 - m.move.y}`;
        mistakesHtml += `
          <div class="good-move-item">
            <span class="move-number-badge ${colorClass}">${m.moveNumber}</span>
            <span>Move ${coord}</span>
          </div>
        `;
      }
    }

    mistakesEl.innerHTML = mistakesHtml;

    // Show content, hide loading
    document.getElementById('analysis-loading').style.display = 'none';
    document.getElementById('analysis-content').style.display = 'block';
  }

  function drawScoreChart(canvas, progression) {
    if (!progression || progression.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth - 48;
    const h = 120;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = 4;
    const chartW = w - pad * 2;
    const chartH = h - pad * 2;
    const midY = pad + chartH / 2;

    // Find max absolute lead for scaling
    let maxLead = 10;
    for (const p of progression) {
      maxLead = Math.max(maxLead, Math.abs(p.lead));
    }

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = 'rgba(212, 168, 85, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, midY);
    ctx.lineTo(w - pad, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = 'rgba(240, 230, 216, 0.3)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('B', 2, pad + 10);
    ctx.fillText('W', 2, h - pad - 4);

    // Score line
    const stepX = chartW / Math.max(progression.length - 1, 1);

    // Fill areas
    ctx.beginPath();
    ctx.moveTo(pad, midY);
    for (let i = 0; i < progression.length; i++) {
      const x = pad + i * stepX;
      const y = midY - (progression[i].lead / maxLead) * (chartH / 2 - 4);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(pad + (progression.length - 1) * stepX, midY);
    ctx.closePath();

    // Gradient fill
    const grad = ctx.createLinearGradient(0, pad, 0, h - pad);
    grad.addColorStop(0, 'rgba(30, 30, 30, 0.5)');
    grad.addColorStop(0.5, 'rgba(212, 168, 85, 0.05)');
    grad.addColorStop(1, 'rgba(240, 236, 228, 0.3)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < progression.length; i++) {
      const x = pad + i * stepX;
      const y = midY - (progression[i].lead / maxLead) * (chartH / 2 - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#d4a855';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Get analysis markers for board overlay
  function getMarkers(analysis) {
    return analysis.moves
      .filter(m => !m.pass && m.quality !== 'neutral')
      .map(m => ({ x: m.x, y: m.y, quality: m.quality }));
  }

  return { render, getMarkers };
})();
