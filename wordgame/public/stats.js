const CHART_COLORS = {
    purple: '#7c83ff',
    gold: '#ffd700',
    green: '#4caf50',
    orange: '#ff9800',
    pink: '#e91e63',
    cyan: '#00bcd4',
    red: '#f44336',
    blue: '#2196f3',
};

const chartInstances = [];

function destroyCharts() {
    chartInstances.forEach(c => c.destroy());
    chartInstances.length = 0;
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

async function loadStats() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div><div>Загрузка статистики...</div></div>';
    destroyCharts();

    try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error('Ошибка загрузки');
        const data = await res.json();
        renderStats(data);
    } catch (e) {
        content.innerHTML = `<div class="error">Ошибка загрузки статистики: ${e.message}</div>`;
    }
}

function renderStats(data) {
    const { overview, levelDistribution, activityByDate, weeklySpeedStats, leaderboards } = data;
    const content = document.getElementById('content');

    content.innerHTML = `
        <div class="overview-grid">
            <div class="stat-card highlight">
                <div class="value">${formatNumber(overview.totalPlayers)}</div>
                <div class="label">Всего игроков</div>
            </div>
            <div class="stat-card green">
                <div class="value">${formatNumber(overview.activeToday)}</div>
                <div class="label">Активны сегодня</div>
            </div>
            <div class="stat-card">
                <div class="value">${formatNumber(overview.activeLast7Days)}</div>
                <div class="label">Активны за 7 дней</div>
            </div>
            <div class="stat-card">
                <div class="value">${formatNumber(overview.activeLast30Days)}</div>
                <div class="label">Активны за 30 дней</div>
            </div>
            <div class="stat-card orange">
                <div class="value">${formatNumber(overview.totalGames)}</div>
                <div class="label">Всего игр</div>
            </div>
            <div class="stat-card green">
                <div class="value">${formatNumber(overview.totalWins)}</div>
                <div class="label">Всего побед</div>
            </div>
            <div class="stat-card pink">
                <div class="value">${formatNumber(overview.totalPerfectGames)}</div>
                <div class="label">Идеальных игр</div>
            </div>
            <div class="stat-card">
                <div class="value">${formatNumber(overview.totalDuelWins)}</div>
                <div class="label">Побед в дуэлях</div>
            </div>
            <div class="stat-card highlight">
                <div class="value">${formatNumber(overview.totalStars)}</div>
                <div class="label">Всего звёзд</div>
            </div>
            <div class="stat-card orange">
                <div class="value">${overview.avgGamesPerPlayer}</div>
                <div class="label">Игр на игрока</div>
            </div>
            <div class="stat-card green">
                <div class="value">${overview.avgWinRate}%</div>
                <div class="label">Средний винрейт</div>
            </div>
            <div class="stat-card">
                <div class="value">${formatNumber(overview.totalCategories)}</div>
                <div class="label">Категорий найдено</div>
            </div>
        </div>

        <div class="charts-grid">
            <div class="chart-card">
                <h2>Активность по дням</h2>
                <div class="chart-container"><canvas id="activityChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h2>Накопительный рост игроков</h2>
                <div class="chart-container"><canvas id="growthChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h2>Распределение по уровням</h2>
                <div class="chart-container"><canvas id="levelChart"></canvas></div>
            </div>
            <div class="chart-card">
                <h2>Обзор игры</h2>
                <div class="chart-container"><canvas id="overviewChart"></canvas></div>
            </div>
        </div>

        <div id="leaderboardsSection"></div>
        <div id="weeklySection"></div>
    `;

    renderActivityChart(activityByDate);
    renderGrowthChart(activityByDate);
    renderLevelChart(levelDistribution);
    renderOverviewChart(overview);
    renderLeaderboards(leaderboards);
    renderWeeklyTable(weeklySpeedStats);
}

function renderActivityChart(activityByDate) {
    const dates = Object.keys(activityByDate).sort();
    const last30 = dates.slice(-30);

    const ctx = document.getElementById('activityChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: last30.map(d => {
                const parts = d.split('-');
                return parts[2] + '.' + parts[1];
            }),
            datasets: [{
                label: 'Активных игроков',
                data: last30.map(d => activityByDate[d].active),
                backgroundColor: CHART_COLORS.purple + '99',
                borderColor: CHART_COLORS.purple,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#8888aa', maxRotation: 45 },
                    grid: { color: '#2a2a4a' }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#8888aa' },
                    grid: { color: '#2a2a4a' }
                }
            }
        }
    });
    chartInstances.push(chart);
}

function renderGrowthChart(activityByDate) {
    const dates = Object.keys(activityByDate).sort();

    // Cumulative player count by date
    let cumulative = 0;
    const cumulativeData = dates.map(d => {
        cumulative += activityByDate[d].active;
        return cumulative;
    });

    const ctx = document.getElementById('growthChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => {
                const parts = d.split('-');
                return parts[2] + '.' + parts[1];
            }),
            datasets: [{
                label: 'Общее кол-во игроков',
                data: cumulativeData,
                borderColor: CHART_COLORS.gold,
                backgroundColor: CHART_COLORS.gold + '20',
                fill: true,
                tension: 0.3,
                pointRadius: dates.length > 30 ? 0 : 3,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#8888aa', maxTicksLimit: 15, maxRotation: 45 },
                    grid: { color: '#2a2a4a' }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#8888aa' },
                    grid: { color: '#2a2a4a' }
                }
            }
        }
    });
    chartInstances.push(chart);
}

function renderLevelChart(levelDistribution) {
    const levels = Object.keys(levelDistribution).map(Number).sort((a, b) => a - b);
    const counts = levels.map(l => levelDistribution[l]);

    // Generate gradient colors
    const colors = levels.map((_, i) => {
        const ratio = i / Math.max(levels.length - 1, 1);
        const r = Math.round(124 + ratio * (233 - 124));
        const g = Math.round(131 + ratio * (30 - 131));
        const b = Math.round(255 + ratio * (99 - 255));
        return `rgb(${r}, ${g}, ${b})`;
    });

    const ctx = document.getElementById('levelChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: levels.map(l => 'Ур. ' + l),
            datasets: [{
                label: 'Игроков',
                data: counts,
                backgroundColor: colors.map(c => c.replace('rgb', 'rgba').replace(')', ', 0.7)')),
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#8888aa' },
                    grid: { color: '#2a2a4a' }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#8888aa' },
                    grid: { color: '#2a2a4a' }
                }
            }
        }
    });
    chartInstances.push(chart);
}

function renderOverviewChart(overview) {
    const ctx = document.getElementById('overviewChart').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [
                'Обычные игры',
                'Идеальные игры',
                'Дуэли',
                'Ежедневные',
                'Еженедельные'
            ],
            datasets: [{
                data: [
                    Math.max(0, overview.totalWins - overview.totalPerfectGames - overview.totalDuelWins),
                    overview.totalPerfectGames,
                    overview.totalDuelWins,
                    overview.totalDailyPuzzles,
                    overview.totalWeeklyPuzzles
                ],
                backgroundColor: [
                    CHART_COLORS.purple + 'cc',
                    CHART_COLORS.green + 'cc',
                    CHART_COLORS.pink + 'cc',
                    CHART_COLORS.orange + 'cc',
                    CHART_COLORS.cyan + 'cc'
                ],
                borderColor: '#1a1a2e',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#ccc',
                        padding: 16,
                        font: { size: 13 }
                    }
                }
            }
        }
    });
    chartInstances.push(chart);
}

function escapeHtmlStats(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderLeaderboards(leaderboards) {
    const section = document.getElementById('leaderboardsSection');
    if (!leaderboards) { section.innerHTML = ''; return; }

    const boards = [
        { key: 'xp', title: 'Лидерборд по XP', valFn: p => `Ур. ${p.level} (${p.xp} XP)` },
        { key: 'duels', title: 'Лидерборд по дуэлям', valFn: p => `${p.duelWins} побед` }
    ];

    let html = '';
    boards.forEach(b => {
        const data = leaderboards[b.key];
        if (!data || !data.length) return;

        const rows = data.map(p => {
            const medal = p.rank === 1 ? '&#129351;' : p.rank === 2 ? '&#129352;' : p.rank === 3 ? '&#129353;' : p.rank;
            const avatar = p.avatar || '&#128100;';
            return `<tr>
                <td>${medal}</td>
                <td>${avatar} ${escapeHtmlStats(p.name)}</td>
                <td>${b.valFn(p)}</td>
                <td>${p.totalWins} побед / ${p.totalGames} игр</td>
            </tr>`;
        }).join('');

        html += `
            <h2 class="section-title">${b.title}</h2>
            <table class="weekly-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Игрок</th>
                        <th>Результат</th>
                        <th>Статистика</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    });

    section.innerHTML = html;
}

function renderWeeklyTable(weeklySpeedStats) {
    const section = document.getElementById('weeklySection');
    const weeks = Object.keys(weeklySpeedStats).sort().reverse();

    if (weeks.length === 0) {
        section.innerHTML = '';
        return;
    }

    let html = '';
    weeks.forEach(w => {
        const s = weeklySpeedStats[w];
        const playerNames = (s.playerList || []).map(p => escapeHtmlStats(p.name));

        html += `
            <div class="weekly-block">
                <h3 class="weekly-week-title">${w} — ${s.participants} участников</h3>
                <table class="weekly-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Игрок</th>
                            <th>Время</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(s.playerList || []).map((p, i) => {
                            const medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : (i + 1);
                            return `<tr>
                                <td>${medal}</td>
                                <td>${escapeHtmlStats(p.name)}</td>
                                <td>${formatTime(p.time)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                <div class="weekly-summary">
                    Лучшее: ${formatTime(s.bestTime)} · Среднее: ${formatTime(s.avgTime)}
                </div>
            </div>`;
    });

    section.innerHTML = `
        <h2 class="section-title">Еженедельные соревнования на скорость</h2>
        ${html}
    `;
}

// Load on page open
loadStats();
