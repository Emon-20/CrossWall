// ─── CrossWall · Main Entry Point ────────────────────────────────────────────
// Wires up the UI, game engine, board renderer, and AI.

import { Game } from './game.js';
import { BoardRenderer } from './board.js';
import { chooseAIAction } from './ai.js';
import {
    showScreen, buildLevelOptions, updateHUD,
    buildPlayerPanel, updatePlayerPanel,
    showWinScreen, hideWinScreen,
} from './ui.js';

/* ── State ───────────────────────────────────────────────────────────────── */

let game = null;
let board = null;
let selectedMode = null;   // 'A' | 'B'
let selectedLevel = null;  // 1 | 2
let aiThinking = false;

/* ── Initialise ──────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-board');
    board = new BoardRenderer(canvas);

    wireMenuButtons();
    wireGameButtons();
    showScreen('menu-screen');
});

/* ── Menu wiring ─────────────────────────────────────────────────────────── */

function wireMenuButtons() {
    // Mode selection
    document.getElementById('btn-2player').addEventListener('click', () => {
        selectedMode = 'A';
        buildLevelOptions('A');
        showScreen('level-screen');
    });
    document.getElementById('btn-4player').addEventListener('click', () => {
        selectedMode = 'B';
        buildLevelOptions('B');
        showScreen('level-screen');
    });

    // Level selection (delegated)
    document.getElementById('level-options').addEventListener('click', (e) => {
        const btn = e.target.closest('.menu-btn');
        if (!btn) return;
        selectedLevel = parseInt(btn.dataset.level);
        showScreen('matchup-screen');
    });

    // Matchup selection
    document.getElementById('btn-local').addEventListener('click', () => startGame('local'));
    document.getElementById('btn-ai').addEventListener('click', () => startGame('ai'));

    // Back buttons
    document.getElementById('btn-back-level').addEventListener('click', () => showScreen('menu-screen'));
    document.getElementById('btn-back-matchup').addEventListener('click', () => showScreen('level-screen'));

    // Win screen buttons
    document.getElementById('btn-play-again').addEventListener('click', () => {
        hideWinScreen();
        startGame(game.matchType);
    });
    document.getElementById('btn-main-menu').addEventListener('click', () => {
        hideWinScreen();
        board.stopLoop();
        game = null;
        showScreen('menu-screen');
    });
}

/* ── Game controls wiring ────────────────────────────────────────────────── */

function wireGameButtons() {
    // Menu button
    document.getElementById('btn-menu').addEventListener('click', () => {
        board.stopLoop();
        game = null;
        hideWinScreen();
        showScreen('menu-screen');
    });

    // Action mode toggle
    document.getElementById('btn-move').addEventListener('click', () => {
        if (!game || game.isGameOver()) return;
        game.actionMode = 'move';
        board.hoverIntersection = null;
        afterStateChange();
    });
    document.getElementById('btn-wall').addEventListener('click', () => {
        if (!game || game.isGameOver()) return;
        if (game.getCurrentPlayer().walls <= 0) return;
        game.actionMode = 'wall';
        afterStateChange();
    });

    // Wall orientation
    document.getElementById('btn-horizontal').addEventListener('click', () => {
        if (game) { game.wallOrientation = 'h'; afterStateChange(); }
    });
    document.getElementById('btn-vertical').addEventListener('click', () => {
        if (game) { game.wallOrientation = 'v'; afterStateChange(); }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (!game || game.isGameOver()) return;
        if (e.key === 'r' || e.key === 'R') {
            game.wallOrientation = game.wallOrientation === 'h' ? 'v' : 'h';
            afterStateChange();
        }
        if (e.key === 'Escape') {
            game.actionMode = 'move';
            board.hoverIntersection = null;
            afterStateChange();
        }
    });
}

/* ── Start a new game ────────────────────────────────────────────────────── */

function startGame(matchType) {
    game = new Game(selectedMode, selectedLevel, matchType);

    board.setGame(game);
    board.onCellClick = onCellClick;
    board.onWallClick = onWallClick;

    buildPlayerPanel(game);
    updateHUD(game);
    showScreen('game-screen');
    board.startLoop();
}

/* ── Board interaction callbacks ─────────────────────────────────────────── */

function onCellClick(row, col) {
    if (!game || game.isGameOver() || aiThinking) return;
    if (game.actionMode !== 'move') return;

    const moved = game.movePlayer(row, col);
    if (!moved) return;

    afterStateChange();

    if (game.isGameOver()) {
        handleWin();
    } else {
        scheduleAI();
    }
}

function onWallClick(orient, row, col) {
    if (!game || game.isGameOver() || aiThinking) return;

    const placed = game.placeWall(orient, row, col);
    if (!placed) return;

    afterStateChange();
    scheduleAI();
}

/* ── AI turn ─────────────────────────────────────────────────────────────── */

function scheduleAI() {
    if (!game || game.isGameOver()) return;
    if (!game.getCurrentPlayer().isAI) return;

    aiThinking = true;
    // Small delay for visual feedback
    setTimeout(runAI, 400);
}

function runAI() {
    if (!game || game.isGameOver()) { aiThinking = false; return; }

    const action = chooseAIAction(game);

    if (action.type === 'move') {
        game.movePlayer(action.row, action.col);
    } else {
        game.placeWall(action.orient, action.row, action.col);
    }

    afterStateChange();

    if (game.isGameOver()) {
        aiThinking = false;
        handleWin();
    } else {
        // Chain AI turns (for 4-player with multiple AI)
        if (game.getCurrentPlayer().isAI) {
            setTimeout(runAI, 400);
        } else {
            aiThinking = false;
        }
    }
}

/* ── State change propagation ────────────────────────────────────────────── */

function afterStateChange() {
    if (!game) return;
    updateHUD(game);
    updatePlayerPanel(game);
    board.refresh();
}

function handleWin() {
    setTimeout(() => showWinScreen(game), 500);
}
