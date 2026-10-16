// ─── CrossWall · Game Engine ─────────────────────────────────────────────────
// Manages game state, rules, turns, wall placement, and win conditions.

import { edgeKey, isBlocked, hasPath, bfs } from './pathfinding.js';

/* ── Mode / Level configurations ────────────────────────────────────────── */
const CONFIGS = {
    'A-1': { rows: 9, cols: 13, wallsPerPlayer: 10 },
    'A-2': { rows: 9, cols: 13, wallsPerPlayer: 10 },
    'B-1': { rows: 9, cols: 9, wallsPerPlayer: 5 },
    'B-2': { rows: 16, cols: 16, wallsPerPlayer: 5 },
};

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];
const PLAYER_NAMES = ['Red', 'Blue', 'Green', 'Yellow'];
const PLAYER_GLOW = ['rgba(239,68,68,0.5)', 'rgba(59,130,246,0.5)', 'rgba(34,197,94,0.5)', 'rgba(234,179,8,0.5)'];

export { PLAYER_COLORS, PLAYER_NAMES, PLAYER_GLOW };

export class Game {
    constructor(mode, level, matchType) {
        this.mode = mode;       // 'A' or 'B'
        this.level = level;     // 1 or 2
        this.matchType = matchType; // 'local' or 'ai'

        const cfg = CONFIGS[`${mode}-${level}`];
        this.rows = cfg.rows;
        this.cols = cfg.cols;
        this.wallsPerPlayer = cfg.wallsPerPlayer;

        this.blockedEdges = new Set();
        this.wallPlacements = new Set();  // "h_r_c" or "v_r_c"
        this.currentPlayer = 0;
        this.winner = null;
        this.turnCount = 0;
        this.actionMode = 'move';       // 'move' | 'wall'
        this.wallOrientation = 'h';     // 'h' | 'v'

        this._setupPlayers();
    }

    /* ── Center-cell helpers ──────────────────────────────────────────── */

    getCenterCells() {
        const cr = Math.floor(this.rows / 2);
        const cc = Math.floor(this.cols / 2);
        if (this.rows % 2 === 1 && this.cols % 2 === 1) return [[cr, cc]];
        const cells = [];
        const rOff = this.rows % 2 === 0 ? [cr - 1, cr] : [cr];
        const cOff = this.cols % 2 === 0 ? [cc - 1, cc] : [cc];
        for (const r of rOff) for (const c of cOff) cells.push([r, c]);
        return cells;
    }

    _makeCenterGoal() {
        const center = this.getCenterCells();
        const set = new Set(center.map(([r, c]) => `${r},${c}`));
        return (r, c) => set.has(`${r},${c}`);
    }

    /* ── Player setup per mode / level ────────────────────────────────── */

    _setupPlayers() {
        const cr = Math.floor(this.rows / 2);
        const cc = Math.floor(this.cols / 2);
        const w = this.wallsPerPlayer;

        if (this.mode === 'A') {
            const goalL1_0 = (r) => r === this.rows - 1;
            const goalL1_1 = (r) => r === 0;
            const centerGoal = this._makeCenterGoal();

            this.players = [
                this._makePlayer(0, 0, cc, w,
                    this.level === 1 ? (r, _c) => goalL1_0(r) : centerGoal),
                this._makePlayer(1, this.rows - 1, cc, w,
                    this.level === 1 ? (r, _c) => goalL1_1(r) : centerGoal),
            ];
        } else {
            const centerGoal = this._makeCenterGoal();
            this.players = [
                this._makePlayer(0, 0, cc, w, centerGoal),
                this._makePlayer(1, this.rows - 1, cc, w, centerGoal),
                this._makePlayer(2, cr, 0, w, centerGoal),
                this._makePlayer(3, cr, this.cols - 1, w, centerGoal),
            ];
        }

        // Mark AI players (player 0 is always human)
        if (this.matchType === 'ai') {
            for (let i = 1; i < this.players.length; i++) {
                this.players[i].isAI = true;
            }
        }
    }

    _makePlayer(id, row, col, walls, goalTest) {
        return {
            id, row, col, walls, goalTest,
            color: PLAYER_COLORS[id],
            glow: PLAYER_GLOW[id],
            name: PLAYER_NAMES[id],
            isAI: false,
        };
    }

    /* ── Accessors ────────────────────────────────────────────────────── */

    getCurrentPlayer() { return this.players[this.currentPlayer]; }
    isGameOver() { return this.winner !== null; }

    /* ── Goal rendering info ──────────────────────────────────────────── */

    getGoalCells() {
        if (this.mode === 'A' && this.level === 1) {
            const goals = [];
            for (let c = 0; c < this.cols; c++) {
                goals.push({ row: this.rows - 1, col: c, forPlayer: 0 });
                goals.push({ row: 0, col: c, forPlayer: 1 });
            }
            return goals;
        }
        // Center-based goals
        return this.getCenterCells().map(([r, c]) => ({ row: r, col: c, forPlayer: -1 }));
    }

    /* ── Valid moves (with Quoridor-style jumping) ────────────────────── */

    getValidMoves(playerIdx) {
        const p = this.players[playerIdx ?? this.currentPlayer];
        const moves = [];
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        for (const [dr, dc] of dirs) {
            const nr = p.row + dr;
            const nc = p.col + dc;
            if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
            if (isBlocked(p.row, p.col, nr, nc, this.blockedEdges)) continue;

            // Check for occupant
            const occupant = this.players.find(o => o.id !== p.id && o.row === nr && o.col === nc);
            if (occupant) {
                // Try straight jump
                const jr = nr + dr;
                const jc = nc + dc;
                if (jr >= 0 && jr < this.rows && jc >= 0 && jc < this.cols
                    && !isBlocked(nr, nc, jr, jc, this.blockedEdges)
                    && !this.players.some(o => o.id !== p.id && o.row === jr && o.col === jc)) {
                    moves.push([jr, jc]);
                } else {
                    // Diagonal jumps
                    const sides = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
                    for (const [sr, sc] of sides) {
                        const dr2 = nr + sr, dc2 = nc + sc;
                        if (dr2 >= 0 && dr2 < this.rows && dc2 >= 0 && dc2 < this.cols
                            && !isBlocked(nr, nc, dr2, dc2, this.blockedEdges)
                            && !this.players.some(o => o.id !== p.id && o.row === dr2 && o.col === dc2)) {
                            moves.push([dr2, dc2]);
                        }
                    }
                }
            } else {
                moves.push([nr, nc]);
            }
        }
        return moves;
    }

    /* ── Move execution ───────────────────────────────────────────────── */

    movePlayer(row, col) {
        if (this.isGameOver()) return false;
        const p = this.getCurrentPlayer();

        // Validate the move
        const valid = this.getValidMoves().some(([r, c]) => r === row && c === col);
        if (!valid) return false;

        p.row = row;
        p.col = col;

        if (p.goalTest(row, col)) {
            this.winner = p.id;
            return true;
        }
        this.nextTurn();
        return true;
    }

    /* ── Wall placement ───────────────────────────────────────────────── */

    /** Get the two blocked edges created by a wall placement */
    _wallEdges(orient, r, c) {
        if (orient === 'h') {
            return [edgeKey(r, c, r + 1, c), edgeKey(r, c + 1, r + 1, c + 1)];
        }
        return [edgeKey(r, c, r, c + 1), edgeKey(r + 1, c, r + 1, c + 1)];
    }

    /** Check if a wall placement is valid (conflicts + path-safety). */
    isWallValid(orient, r, c) {
        if (r < 0 || r >= this.rows - 1 || c < 0 || c >= this.cols - 1) return false;
        if (this.getCurrentPlayer().walls <= 0) return false;

        const key = `${orient}_${r}_${c}`;

        // Duplicate check
        if (this.wallPlacements.has(key)) return false;

        // Crossing check (opposite orientation at same intersection)
        const crossKey = `${orient === 'h' ? 'v' : 'h'}_${r}_${c}`;
        if (this.wallPlacements.has(crossKey)) return false;

        // Overlap check (same orientation, adjacent)
        if (orient === 'h') {
            if (this.wallPlacements.has(`h_${r}_${c - 1}`)) return false;
            if (this.wallPlacements.has(`h_${r}_${c + 1}`)) return false;
        } else {
            if (this.wallPlacements.has(`v_${r - 1}_${c}`)) return false;
            if (this.wallPlacements.has(`v_${r + 1}_${c}`)) return false;
        }

        // Path-safety: temporarily place wall and BFS-check every player
        const edges = this._wallEdges(orient, r, c);
        for (const e of edges) this.blockedEdges.add(e);

        let safe = true;
        for (const p of this.players) {
            if (!hasPath(p.row, p.col, p.goalTest, this.rows, this.cols, this.blockedEdges)) {
                safe = false;
                break;
            }
        }

        for (const e of edges) this.blockedEdges.delete(e);
        return safe;
    }

    /** Place a wall. Returns true on success. */
    placeWall(orient, r, c) {
        if (this.isGameOver()) return false;
        if (!this.isWallValid(orient, r, c)) return false;

        this.wallPlacements.add(`${orient}_${r}_${c}`);
        const edges = this._wallEdges(orient, r, c);
        for (const e of edges) this.blockedEdges.add(e);

        this.getCurrentPlayer().walls--;
        this.nextTurn();
        return true;
    }

    /* ── Turn management ──────────────────────────────────────────────── */

    nextTurn() {
        this.turnCount++;
        this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
        this.actionMode = 'move';
    }

    /* ── Utility: enumerate all valid wall placements (for AI) ────────── */

    getAllValidWalls() {
        const walls = [];
        for (let r = 0; r < this.rows - 1; r++) {
            for (let c = 0; c < this.cols - 1; c++) {
                if (this.isWallValid('h', r, c)) walls.push(['h', r, c]);
                if (this.isWallValid('v', r, c)) walls.push(['v', r, c]);
            }
        }
        return walls;
    }
}
