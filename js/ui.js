// ─── CrossWall · UI Controller ───────────────────────────────────────────────
// Manages screen transitions, HUD updates, player panels, and win celebration.

import { PLAYER_COLORS, PLAYER_NAMES } from './game.js';

/* ── Screen management ───────────────────────────────────────────────────── */

const SCREENS = ['menu-screen', 'level-screen', 'matchup-screen', 'game-screen'];

export function showScreen(id) {
    for (const s of SCREENS) {
        const el = document.getElementById(s);
        el.classList.toggle('active', s === id);
    }
}

/* ── Level selection builder ─────────────────────────────────────────────── */

export function buildLevelOptions(mode) {
    const container = document.getElementById('level-options');
    container.innerHTML = '';

    if (mode === 'A') {
        container.appendChild(levelBtn(1,
            '🏁 Level 1', 'Reach opponent\'s baseline first', '13×9 Grid'));
        container.appendChild(levelBtn(2,
            '🎯 Level 2', 'Race to the exact center cell', '13×9 Grid'));
    } else {
        container.appendChild(levelBtn(1,
            '🏁 Level 1', '4-player race to the center', '9×9 Grid'));
        container.appendChild(levelBtn(2,
            '🌐 Level 2', 'Expanded 4-player center race', '16×16 Grid'));
    }
}

function levelBtn(level, title, desc, grid) {
    const btn = document.createElement('button');
    btn.className = 'menu-btn';
    btn.dataset.level = level;
    btn.innerHTML = `
        <span class="btn-icon">${title.split(' ')[0]}</span>
        <span class="btn-text">${title.split(' ').slice(1).join(' ')}</span>
        <span class="btn-desc">${desc}<br><small>${grid}</small></span>
    `;
    return btn;
}

/* ── HUD updates ─────────────────────────────────────────────────────────── */

export function updateHUD(game) {
    const p = game.getCurrentPlayer();

    // Turn indicator
    const turnColor = document.getElementById('turn-color');
    const turnText = document.getElementById('turn-text');
    turnColor.style.background = p.color;
    turnColor.style.boxShadow = `0 0 10px ${p.glow}`;
    turnText.textContent = `${p.name}'s Turn${p.isAI ? ' (AI)' : ''}`;

    // Wall count
    document.getElementById('wall-count').textContent = p.walls;

    // Action buttons
    const btnMove = document.getElementById('btn-move');
    const btnWall = document.getElementById('btn-wall');
    btnMove.classList.toggle('active', game.actionMode === 'move');
    btnWall.classList.toggle('active', game.actionMode === 'wall');
    btnWall.disabled = p.walls <= 0;

    // Wall orientation
    const orientPanel = document.getElementById('wall-orientation');
    orientPanel.style.display = game.actionMode === 'wall' ? 'flex' : 'none';
    document.getElementById('btn-horizontal').classList.toggle('active', game.wallOrientation === 'h');
    document.getElementById('btn-vertical').classList.toggle('active', game.wallOrientation === 'v');
}

/* ── Player info panel ───────────────────────────────────────────────────── */

export function buildPlayerPanel(game) {
    const panel = document.getElementById('players-panel');
    panel.innerHTML = '';

    for (const p of game.players) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.id = `player-card-${p.id}`;
        card.innerHTML = `
            <div class="player-color-dot" style="background:${p.color};box-shadow:0 0 8px ${p.glow}"></div>
            <div class="player-info">
                <span class="player-name">${p.name}${p.isAI ? ' 🤖' : ''}</span>
                <span class="player-walls">🧱 ×${p.walls}</span>
            </div>
        `;
        panel.appendChild(card);
    }
    highlightActivePlayer(game);
}

export function updatePlayerPanel(game) {
    for (const p of game.players) {
        const card = document.getElementById(`player-card-${p.id}`);
        if (!card) continue;
        card.querySelector('.player-walls').textContent = `🧱 ×${p.walls}`;
    }
    highlightActivePlayer(game);
}

function highlightActivePlayer(game) {
    for (const p of game.players) {
        const card = document.getElementById(`player-card-${p.id}`);
        if (!card) continue;
        card.classList.toggle('active', p.id === game.currentPlayer);
    }
}

/* ── Win celebration ─────────────────────────────────────────────────────── */

export function showWinScreen(game) {
    const overlay = document.getElementById('win-overlay');
    const p = game.players[game.winner];

    document.getElementById('win-title').textContent = `🎉 ${p.name} Wins! 🎉`;
    document.getElementById('win-title').style.color = p.color;
    document.getElementById('win-subtitle').textContent =
        `Victory in ${game.turnCount} turns!`;

    overlay.classList.add('active');
    spawnConfetti();
}

export function hideWinScreen() {
    document.getElementById('win-overlay').classList.remove('active');
    document.getElementById('confetti').innerHTML = '';
}

function spawnConfetti() {
    const container = document.getElementById('confetti');
    container.innerHTML = '';
    const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#f97316', '#06b6d4'];

    for (let i = 0; i < 80; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = Math.random() * 1.5 + 's';
        piece.style.animationDuration = (2 + Math.random() * 2) + 's';
        const size = 6 + Math.random() * 8;
        piece.style.width = size + 'px';
        piece.style.height = size * (0.4 + Math.random() * 0.6) + 'px';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        piece.style.transform = `rotate(${Math.random() * 360}deg)`;
        container.appendChild(piece);
    }
}
