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
    const stars = getStars(mistakesMade, maxMist, hintsUsedThisRound);
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

    return `В тему! ${puzzleNum} (${diff.label}) ${starStr}\n\n${grid}\n⏱ ${minutes}:${secs} | ❌ ${mistakesMade}/${maxMist}\n🔥 Серия: ${save.currentStreak}`;
}

// =============================================
// CANVAS-BASED SHARE CARD
// =============================================
function generateShareCard() {
    return new Promise((resolve) => {
        const W = 480;
        const H = 640;
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
        ctx.fillText('В тему!', W / 2, 50);

        // Difficulty badge
        const diff = DIFF_META[difficulty];
        const diffColors = { easy: '#34d399', hard: '#fb923c', expert: '#f87171' };
        const puzzleNum = isEndless ? 'Бесконечный' : `Паззл #${puzzleIndex + 1}`;
        ctx.font = '600 16px Inter, sans-serif';
        ctx.fillStyle = diffColors[difficulty] || '#8888a0';
        ctx.fillText(`${diff.label} — ${puzzleNum}`, W / 2, 80);

        // Stars
        const stars = getStars(mistakesMade, maxMist, hintsUsedThisRound);
        const starY = 115;
        ctx.font = '32px serif';
        ctx.textAlign = 'center';
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i < stars ? '#f9df6d' : '#333344';
            ctx.fillText('★', W / 2 - 40 + i * 40, starY);
        }

        // Category grid — each row includes category label below it
        const gridX = 40;
        const gridY = 150;
        const cellW = (W - 80) / 4;
        const cellH = 48;
        const cellGap = 6;
        const labelHeight = 22;   // space for category label below cells
        const rowHeight = cellH + labelHeight;  // total height per category row

        solvedCats.forEach((cat, row) => {
            const rowY = gridY + row * (rowHeight + cellGap);

            // Draw word cells
            for (let col = 0; col < 4; col++) {
                const x = gridX + col * (cellW + cellGap);

                // Cell background
                ctx.fillStyle = cat.color;
                roundRect(ctx, x, rowY, cellW - cellGap, cellH, 10);
                ctx.fill();

                // Word text
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(cat.words[col], x + (cellW - cellGap) / 2, rowY + cellH / 2 + 4);
            }

            // Category label directly below its row
            ctx.fillStyle = cat.color;
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(cat.theme, gridX, rowY + cellH + 15);
        });

        // Stats section — positioned after all category rows
        const statsY = gridY + 4 * (rowHeight + cellGap) + 20;

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
        ctx.fillText('Сыграй сам — В тему!', W / 2, H - 20);

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
            const file = new File([blob], 'vtemu-result.png', { type: 'image/png' });
            const shareData = { files: [file], text: 'Мой результат в «В тему!»' };
            if (navigator.canShare(shareData)) {
                await navigator.share(shareData);
                return;
            }
        }

        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vtemu-result.png';
        a.click();
        URL.revokeObjectURL(url);
        showToast('&#128247;', 'Карточка сохранена!');
    } catch (e) {
        console.warn('Share image failed:', e.message);
        showToast('&#9888;', 'Не удалось поделиться');
    }
}

// =============================================
// LEADERBOARD SHARE
// =============================================
function generateLeaderboardCard() {
    return new Promise((resolve) => {
        const W = 480;
        const H = 400;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#0f0f13';
        ctx.fillRect(0, 0, W, H);

        // Gradient top bar
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, '#7c6af6');
        grad.addColorStop(0.5, '#c084fc');
        grad.addColorStop(1, '#f0abfc');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, 4);

        // Title
        ctx.fillStyle = '#eeeef0';
        ctx.font = 'bold 32px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('В тему! — Лидерборд', W / 2, 50);

        // Sort label
        const sortNames = { xp: 'Уровень', streak: 'Стрик', stars: 'Звёзды', duels: 'Дуэли' };
        const sortName = sortNames[currentLeaderboardSort] || 'Уровень';
        ctx.font = '600 16px Inter, sans-serif';
        ctx.fillStyle = '#8888a0';
        ctx.fillText(`Рейтинг: ${sortName}`, W / 2, 80);

        // Rank circle
        const rank = lastLeaderboardMyRank > 0 ? lastLeaderboardMyRank : '?';
        const rankY = 150;
        ctx.beginPath();
        ctx.arc(W / 2, rankY, 45, 0, Math.PI * 2);
        const rankGrad = ctx.createRadialGradient(W / 2, rankY, 0, W / 2, rankY, 45);
        rankGrad.addColorStop(0, '#7c6af6');
        rankGrad.addColorStop(1, '#c084fc');
        ctx.fillStyle = rankGrad;
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`#${rank}`, W / 2, rankY + 13);

        // Player name
        const name = getPlayerName();
        ctx.fillStyle = '#eeeef0';
        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.fillText(name, W / 2, rankY + 75);

        // Stats boxes
        const statsY = rankY + 100;
        const stats = [
            { label: 'УРОВЕНЬ', value: `${save.level}`, color: '#fbbf24' },
            { label: 'ПОБЕДЫ', value: `${save.totalWins}`, color: '#34d399' },
            { label: 'СТРИК', value: `${save.bestStreak}`, color: '#f87171' },
            { label: 'ЗВЁЗДЫ', value: `${calcTotalStars()}`, color: '#7c6af6' }
        ];

        const statBoxW = (W - 80 - 30) / 4;
        const gridX = 40;
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
        ctx.fillText('Сыграй сам — В тему!', W / 2, H - 20);

        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
}

async function shareLeaderboardPosition() {
    try {
        const blob = await generateLeaderboardCard();

        if (navigator.share && navigator.canShare) {
            const file = new File([blob], 'vtemu-leaderboard.png', { type: 'image/png' });
            const shareData = { files: [file], text: 'Моё место в лидерборде «В тему!»' };
            if (navigator.canShare(shareData)) {
                await navigator.share(shareData);
                return;
            }
        }

        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vtemu-leaderboard.png';
        a.click();
        URL.revokeObjectURL(url);
        showToast('&#128228;', 'Карточка сохранена!');
    } catch (e) {
        console.warn('Share leaderboard failed:', e.message);
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
