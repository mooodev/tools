/**
 * share.js — Share result card (Wordle-style visual + Canvas image)
 *
 * Depends on: save.js, game.js (solvedCats, puzzle, difficulty, etc.)
 */

// =============================================
// TEXT-BASED SHARE (Wordle-style)
// =============================================
function generateShareText() {
    const diff = DIFF_META[difficulty];
    const stars = getStars(mistakesMade, maxMist);
    const elapsed = getElapsed();
    const minutes = Math.floor(elapsed / 60);
    const secs = String(elapsed % 60).padStart(2, '0');

    // Emoji grid: each solved category gets a row of 4 colored squares
    const colorMap = {};
    if (puzzle && puzzle.categories) {
        puzzle.categories.forEach((cat, i) => {
            const emojis = ['🟩', '🟨', '🟧', '🟪'];
            colorMap[cat.theme] = emojis[i] || '⬜';
        });
    }

    let grid = '';
    solvedCats.forEach(cat => {
        const emoji = colorMap[cat.theme] || '⬜';
        grid += emoji.repeat(4) + '\n';
    });

    const starStr = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    const puzzleNum = isEndless ? 'Бесконечный' : `#${puzzleIndex + 1}`;

    return `Связи ${puzzleNum} (${diff.label}) ${starStr}\n\n${grid}\n⏱ ${minutes}:${secs} | ❌ ${mistakesMade}/${maxMist}\n🔥 Серия: ${save.currentStreak}`;
}

// =============================================
// CANVAS-BASED SHARE CARD
// =============================================
function generateShareCard() {
    return new Promise((resolve) => {
        const W = 480;
        const H = 560;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#0f0f13';
        ctx.fillRect(0, 0, W, H);

        // Decorative gradient top bar
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, '#7c6af6');
        grad.addColorStop(0.5, '#c084fc');
        grad.addColorStop(1, '#f0abfc');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, 4);

        // Title
        ctx.fillStyle = '#eeeef0';
        ctx.font = 'bold 36px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Связи', W / 2, 50);

        // Difficulty badge
        const diff = DIFF_META[difficulty];
        const diffColors = { easy: '#34d399', medium: '#fbbf24', hard: '#fb923c', expert: '#f87171' };
        const puzzleNum = isEndless ? 'Бесконечный' : `Паззл #${puzzleIndex + 1}`;
        ctx.font = '600 16px Inter, sans-serif';
        ctx.fillStyle = diffColors[difficulty] || '#8888a0';
        ctx.fillText(`${diff.label} — ${puzzleNum}`, W / 2, 80);

        // Stars
        const stars = getStars(mistakesMade, maxMist);
        const starY = 115;
        ctx.font = '32px serif';
        ctx.textAlign = 'center';
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i < stars ? '#f9df6d' : '#333344';
            ctx.fillText('★', W / 2 - 40 + i * 40, starY);
        }

        // Category grid
        const gridX = 40;
        const gridY = 150;
        const cellW = (W - 80) / 4;
        const cellH = 52;
        const gap = 6;

        solvedCats.forEach((cat, row) => {
            for (let col = 0; col < 4; col++) {
                const x = gridX + col * (cellW + gap);
                const y = gridY + row * (cellH + gap);

                // Cell background
                ctx.fillStyle = cat.color;
                roundRect(ctx, x, y, cellW - gap, cellH, 10);
                ctx.fill();

                // Word text
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(cat.words[col], x + (cellW - gap) / 2, y + cellH / 2 + 4);
            }
        });

        // Category labels (below each row)
        solvedCats.forEach((cat, row) => {
            const y = gridY + row * (cellH + gap) + cellH + 16;
            ctx.fillStyle = cat.color;
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(cat.theme, gridX, y);
        });

        // Stats section
        const statsY = gridY + 4 * (cellH + gap) + 50;

        // Stat boxes
        const elapsed = getElapsed();
        const minutes = Math.floor(elapsed / 60);
        const secs = String(elapsed % 60).padStart(2, '0');

        const stats = [
            { label: 'ВРЕМЯ', value: `${minutes}:${secs}`, color: '#7c6af6' },
            { label: 'ОШИБКИ', value: `${mistakesMade}/${maxMist}`, color: '#f87171' },
            { label: 'СЕРИЯ', value: `${save.currentStreak}`, color: '#34d399' },
            { label: 'УРОВЕНЬ', value: `${save.level}`, color: '#fbbf24' }
        ];

        const statBoxW = (W - 80 - 30) / 4;
        stats.forEach((stat, i) => {
            const x = gridX + i * (statBoxW + 10);
            ctx.fillStyle = '#1a1a23';
            roundRect(ctx, x, statsY, statBoxW, 60, 10);
            ctx.fill();

            ctx.fillStyle = stat.color;
            ctx.font = 'bold 22px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(stat.value, x + statBoxW / 2, statsY + 30);

            ctx.fillStyle = '#8888a0';
            ctx.font = '600 9px Inter, sans-serif';
            ctx.fillText(stat.label, x + statBoxW / 2, statsY + 50);
        });

        // Footer
        ctx.fillStyle = '#55556a';
        ctx.font = '500 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Сыграй сам — Связи', W / 2, H - 20);

        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
}

// =============================================
// SHARE ACTIONS
// =============================================
async function shareResultText() {
    const text = generateShareText();

    if (navigator.share) {
        try {
            await navigator.share({ text });
            return true;
        } catch (e) {
            // User cancelled or not supported
        }
    }

    // Fallback: copy to clipboard
    try {
        await navigator.clipboard.writeText(text);
        showToast('&#128203;', 'Результат скопирован!');
        return true;
    } catch (e) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('&#128203;', 'Результат скопирован!');
        return true;
    }
}

async function shareResultImage() {
    try {
        const blob = await generateShareCard();

        if (navigator.share && navigator.canShare) {
            const file = new File([blob], 'svyazi-result.png', { type: 'image/png' });
            const shareData = { files: [file], text: 'Мой результат в Связях!' };
            if (navigator.canShare(shareData)) {
                await navigator.share(shareData);
                return;
            }
        }

        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'svyazi-result.png';
        a.click();
        URL.revokeObjectURL(url);
        showToast('&#128247;', 'Карточка сохранена!');
    } catch (e) {
        console.warn('Share image failed:', e.message);
        showToast('&#9888;', 'Не удалось поделиться');
    }
}

// =============================================
// CANVAS HELPER
// =============================================
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
