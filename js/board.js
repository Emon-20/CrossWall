// ─── CrossWall · Board Renderer ──────────────────────────────────────────────
// Canvas-based renderer with smooth animations, hover previews, and full
// mouse / touch interactivity.

import { PLAYER_COLORS } from './game.js';

/* ── Colour palette ──────────────────────────────────────────────────────── */
const C = {
    boardBg:     '#0b0e18',
    cellFill:    '#171c2c',
    cellBorder:  '#232840',
    groove:      '#0d1019',
    wallFill:    '#d4a44c',
    wallGlow:    'rgba(212,164,76,0.45)',
    goalGlow:    'rgba(255,215,0,0.25)',
    goalCenter:  'rgba(255,215,0,0.12)',
    moveHint:    0.3,   // alpha for valid-move overlay
    previewAlpha: 0.45,
    shadow:      'rgba(0,0,0,0.5)',
};

export class BoardRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.game = null;
        this.dpr = window.devicePixelRatio || 1;

        // Layout metrics (recomputed on resize / new game)
        this.cellSize = 0;
        this.grooveW = 0;
        this.pitch = 0;
        this.boardW = 0;
        this.boardH = 0;
        this.offsetX = 0;
        this.offsetY = 0;

        // Interaction state
        this.hoverIntersection = null;  // {r, c} or null
        this.validMoves = [];
        this.animPhase = 0;

        // Callbacks (set by main.js)
        this.onCellClick = null;
        this.onWallClick = null;

        this._bindEvents();
        this._resizeObserver = new ResizeObserver(() => this._resize());
        this._resizeObserver.observe(canvas.parentElement);
    }

    /* ── Public API ──────────────────────────────────────────────────── */

    setGame(game) {
        this.game = game;
        this._resize();
        this.validMoves = game.getValidMoves();
    }

    refresh() {
        if (!this.game) return;
        this.validMoves = this.game.getValidMoves();
        this._draw();
    }

    startLoop() {
        const loop = () => {
            this.animPhase = (performance.now() / 1000) % (Math.PI * 200);
            this._draw();
            this._raf = requestAnimationFrame(loop);
        };
        loop();
    }

    stopLoop() {
        if (this._raf) cancelAnimationFrame(this._raf);
    }

    /* ── Layout ──────────────────────────────────────────────────────── */

    _resize() {
        if (!this.game) return;
        const parent = this.canvas.parentElement;
        const maxW = parent.clientWidth - 16;
        const maxH = parent.clientHeight - 16;

        const { rows, cols } = this.game;
        const grooveRatio = 0.14;

        // Compute largest cell size that fits
        let cs = Math.floor(Math.min(
            maxW / (cols + (cols - 1) * grooveRatio),
            maxH / (rows + (rows - 1) * grooveRatio),
        ));
        cs = Math.max(18, Math.min(cs, 64));

        this.cellSize = cs;
        this.grooveW = Math.max(3, Math.round(cs * grooveRatio));
        this.pitch = cs + this.grooveW;
        this.boardW = cols * cs + (cols - 1) * this.grooveW;
        this.boardH = rows * cs + (rows - 1) * this.grooveW;

        const cw = this.boardW + 32;
        const ch = this.boardH + 32;
        this.canvas.style.width = cw + 'px';
        this.canvas.style.height = ch + 'px';
        this.canvas.width = cw * this.dpr;
        this.canvas.height = ch * this.dpr;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        this.offsetX = (cw - this.boardW) / 2;
        this.offsetY = (ch - this.boardH) / 2;
    }

    /* ── Coordinate helpers ──────────────────────────────────────────── */

    _cellXY(r, c) {
        return [this.offsetX + c * this.pitch, this.offsetY + r * this.pitch];
    }

    _cellCenter(r, c) {
        const [x, y] = this._cellXY(r, c);
        return [x + this.cellSize / 2, y + this.cellSize / 2];
    }

    _intersectionCenter(r, c) {
        return [
            this.offsetX + c * this.pitch + this.cellSize + this.grooveW / 2,
            this.offsetY + r * this.pitch + this.cellSize + this.grooveW / 2,
        ];
    }

    /** Convert mouse coords to board-relative coords */
    _mouseToBoard(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / this.dpr / rect.width;
        const scaleY = this.canvas.height / this.dpr / rect.height;
        return [
            (e.clientX - rect.left) * scaleX,
            (e.clientY - rect.top) * scaleY,
        ];
    }

    /** Find the cell under a board-relative point, or null */
    _hitCell(bx, by) {
        const lx = bx - this.offsetX;
        const ly = by - this.offsetY;
        if (lx < 0 || ly < 0) return null;

        const c = Math.floor(lx / this.pitch);
        const r = Math.floor(ly / this.pitch);
        const rx = lx - c * this.pitch;
        const ry = ly - r * this.pitch;

        if (c < 0 || c >= this.game.cols || r < 0 || r >= this.game.rows) return null;
        if (rx > this.cellSize || ry > this.cellSize) return null;
        return { r, c };
    }

    /** Find the nearest intersection point */
    _hitIntersection(bx, by) {
        const lx = bx - this.offsetX;
        const ly = by - this.offsetY;

        const fc = (lx - this.cellSize - this.grooveW / 2) / this.pitch;
        const fr = (ly - this.cellSize - this.grooveW / 2) / this.pitch;
        const c = Math.round(fc);
        const r = Math.round(fr);

        if (r < 0 || r >= this.game.rows - 1 || c < 0 || c >= this.game.cols - 1) return null;

        const [ix, iy] = this._intersectionCenter(r, c);
        const dist = Math.hypot(bx - ix, by - iy);
        if (dist > this.cellSize * 0.75) return null;
        return { r, c };
    }

    /* ── Event handling ──────────────────────────────────────────────── */

    _bindEvents() {
        const cvs = this.canvas;

        // Mouse
        cvs.addEventListener('mousemove', (e) => this._onPointerMove(e));
        cvs.addEventListener('click', (e) => this._onClick(e));
        cvs.addEventListener('mouseleave', () => { this.hoverIntersection = null; });

        // Touch
        cvs.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.changedTouches[0];
            this._onClick(t);
        }, { passive: false });
        cvs.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const t = e.changedTouches[0];
            this._onPointerMove(t);
        }, { passive: false });
    }

    _onPointerMove(e) {
        if (!this.game || this.game.isGameOver()) return;
        const [bx, by] = this._mouseToBoard(e);

        if (this.game.actionMode === 'wall') {
            this.hoverIntersection = this._hitIntersection(bx, by);
        } else {
            this.hoverIntersection = null;
        }
    }

    _onClick(e) {
        if (!this.game || this.game.isGameOver()) return;
        if (this.game.getCurrentPlayer().isAI) return;

        const [bx, by] = this._mouseToBoard(e);

        if (this.game.actionMode === 'wall') {
            const hit = this._hitIntersection(bx, by);
            if (hit && this.onWallClick) {
                this.onWallClick(this.game.wallOrientation, hit.r, hit.c);
            }
        } else {
            const hit = this._hitCell(bx, by);
            if (hit && this.onCellClick) {
                this.onCellClick(hit.r, hit.c);
            }
        }
    }

    /* ── Drawing ─────────────────────────────────────────────────────── */

    _draw() {
        if (!this.game) return;
        const ctx = this.ctx;
        const w = this.canvas.width / this.dpr;
        const h = this.canvas.height / this.dpr;

        ctx.clearRect(0, 0, w, h);

        this._drawBoard(ctx);
        this._drawGoals(ctx);
        this._drawValidMoves(ctx);
        this._drawWalls(ctx);
        this._drawWallPreview(ctx);
        this._drawPlayers(ctx);
    }

    _drawBoard(ctx) {
        const { rows, cols } = this.game;
        const cs = this.cellSize;
        const gw = this.grooveW;

        // Board shadow/bg
        const bx = this.offsetX - 4;
        const by = this.offsetY - 4;
        ctx.fillStyle = C.boardBg;
        roundRect(ctx, bx, by, this.boardW + 8, this.boardH + 8, 8);
        ctx.fill();

        // Grooves (filled as one big rect, cells punch out on top)
        ctx.fillStyle = C.groove;
        ctx.fillRect(this.offsetX, this.offsetY, this.boardW, this.boardH);

        // Cells
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const [x, y] = this._cellXY(r, c);
                ctx.fillStyle = C.cellFill;
                roundRect(ctx, x, y, cs, cs, 3);
                ctx.fill();
                ctx.strokeStyle = C.cellBorder;
                ctx.lineWidth = 0.5;
                roundRect(ctx, x, y, cs, cs, 3);
                ctx.stroke();
            }
        }
    }

    _drawGoals(ctx) {
        const goals = this.game.getGoalCells();
        const cs = this.cellSize;
        const pulse = Math.sin(this.animPhase * 2.5) * 0.5 + 0.5;

        for (const g of goals) {
            const [x, y] = this._cellXY(g.row, g.col);
            const alpha = 0.08 + pulse * 0.10;

            if (g.forPlayer >= 0 && g.forPlayer < PLAYER_COLORS.length) {
                const rgb = hexToRgb(PLAYER_COLORS[g.forPlayer]);
                ctx.fillStyle = `rgba(${rgb},${alpha})`;
            } else {
                ctx.fillStyle = `rgba(255,215,0,${alpha})`;
            }
            roundRect(ctx, x + 1, y + 1, cs - 2, cs - 2, 3);
            ctx.fill();

            // Small diamond in center for center-goal cells
            if (g.forPlayer === -1) {
                const cx = x + cs / 2;
                const cy = y + cs / 2;
                const s = cs * 0.18;
                ctx.fillStyle = `rgba(255,215,0,${0.3 + pulse * 0.3})`;
                ctx.beginPath();
                ctx.moveTo(cx, cy - s);
                ctx.lineTo(cx + s, cy);
                ctx.lineTo(cx, cy + s);
                ctx.lineTo(cx - s, cy);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    _drawValidMoves(ctx) {
        if (this.game.actionMode !== 'move') return;
        if (this.game.getCurrentPlayer().isAI) return;

        const cs = this.cellSize;
        const p = this.game.getCurrentPlayer();
        const pulse = Math.sin(this.animPhase * 3) * 0.08 + 0.25;

        for (const [r, c] of this.validMoves) {
            const [x, y] = this._cellXY(r, c);
            const rgb = hexToRgb(p.color);
            ctx.fillStyle = `rgba(${rgb},${pulse})`;
            roundRect(ctx, x + 2, y + 2, cs - 4, cs - 4, 3);
            ctx.fill();

            // Dot indicator
            const [cx, cy] = this._cellCenter(r, c);
            ctx.fillStyle = `rgba(${rgb},${pulse + 0.2})`;
            ctx.beginPath();
            ctx.arc(cx, cy, cs * 0.12, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawWalls(ctx) {

        for (const wk of this.game.wallPlacements) {
            const [orient, rs, cs_] = wk.split('_');
            const r = +rs, c = +cs_;
            this._drawSingleWall(ctx, orient, r, c, C.wallFill, 1.0);
        }
    }

    _drawSingleWall(ctx, orient, r, c, color, alpha) {
        const cs = this.cellSize;
        const gw = this.grooveW;
        const p = this.pitch;

        let x, y, w, h;
        if (orient === 'h') {
            x = this.offsetX + c * p;
            y = this.offsetY + r * p + cs;
            w = cs * 2 + gw;
            h = gw;
        } else {
            x = this.offsetX + c * p + cs;
            y = this.offsetY + r * p;
            w = gw;
            h = cs * 2 + gw;
        }

        // Glow
        if (alpha > 0.6) {
            ctx.shadowColor = C.wallGlow;
            ctx.shadowBlur = 10;
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        roundRect(ctx, x, y, w, h, 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }

    _drawWallPreview(ctx) {
        if (!this.hoverIntersection) return;
        if (this.game.actionMode !== 'wall') return;

        const { r, c } = this.hoverIntersection;
        const orient = this.game.wallOrientation;
        const valid = this.game.isWallValid(orient, r, c);
        const color = valid ? this.game.getCurrentPlayer().color : '#ff3333';
        this._drawSingleWall(ctx, orient, r, c, color, valid ? C.previewAlpha : 0.25);
    }

    _drawPlayers(ctx) {
        const cs = this.cellSize;
        const radius = cs * 0.35;

        for (const p of this.game.players) {
            const [cx, cy] = this._cellCenter(p.row, p.col);

            // Shadow
            ctx.fillStyle = C.shadow;
            ctx.beginPath();
            ctx.arc(cx + 2, cy + 2, radius, 0, Math.PI * 2);
            ctx.fill();

            // Glow ring for current player
            if (p.id === this.game.currentPlayer && !this.game.isGameOver()) {
                const pulse = Math.sin(this.animPhase * 4) * 3 + 6;
                ctx.shadowColor = p.glow;
                ctx.shadowBlur = pulse;
            }

            // Main circle
            const grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
            const rgb = hexToRgb(p.color);
            grad.addColorStop(0, `rgba(${rgb},1)`);
            grad.addColorStop(0.5, p.color);
            grad.addColorStop(1, `rgba(${Math.max(0, parseInt(rgb.split(',')[0]) - 50)},${Math.max(0, parseInt(rgb.split(',')[1]) - 50)},${Math.max(0, parseInt(rgb.split(',')[2]) - 50)},1)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();

            // Inner highlight
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.35, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // Player label
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.max(9, cs * 0.26)}px Outfit, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.name[0], cx, cy + 1);
        }
    }
}

/* ── Utility ──────────────────────────────────────────────────────────────── */

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

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
}
