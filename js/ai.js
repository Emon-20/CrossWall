// ─── CrossWall · AI Module ───────────────────────────────────────────────────
// BFS-based AI that moves along shortest path or places strategic walls.

import { bfs, getShortestPath } from './pathfinding.js';

/**
 * Choose the best action for the current AI player.
 * Returns { type: 'move', row, col } or { type: 'wall', orient, row, col }.
 */
export function chooseAIAction(game) {
    const me = game.getCurrentPlayer();
    const myDist = bfs(me.row, me.col, me.goalTest, game.rows, game.cols, game.blockedEdges);

    // Gather opponent distances
    const opponents = game.players.filter(p => p.id !== me.id);
    const oppDists = opponents.map(p =>
        bfs(p.row, p.col, p.goalTest, game.rows, game.cols, game.blockedEdges)
    );
    const minOppDist = Math.min(...oppDists);

    // ── Decision: move or wall? ──
    // If I'm in the lead or have no walls, just move
    const shouldMove = me.walls === 0 || myDist <= minOppDist;

    if (!shouldMove && Math.random() < 0.7) {
        // Try to place a blocking wall
        const wallAction = chooseBestWall(game, me, opponents);
        if (wallAction) return wallAction;
    }

    // Move along shortest path
    return chooseBestMove(game, me);
}

/**
 * Move along the shortest path toward the goal.
 */
function chooseBestMove(game, me) {
    const path = getShortestPath(me.row, me.col, me.goalTest, game.rows, game.cols, game.blockedEdges);
    const validMoves = game.getValidMoves();

    if (path && path.length >= 2) {
        const [nr, nc] = path[1];
        // Make sure this move is valid (accounts for jump rules)
        if (validMoves.some(([r, c]) => r === nr && c === nc)) {
            return { type: 'move', row: nr, col: nc };
        }
    }

    // Fallback: pick the move that gets closest to goal
    let best = null;
    let bestDist = Infinity;
    for (const [r, c] of validMoves) {
        const d = bfs(r, c, me.goalTest, game.rows, game.cols, game.blockedEdges);
        if (d < bestDist) {
            bestDist = d;
            best = { type: 'move', row: r, col: c };
        }
    }
    return best || { type: 'move', row: me.row, col: me.col };
}

/**
 * Try to find a wall that maximally increases the leading opponent's path.
 * Samples random valid walls to avoid expensive full enumeration on large boards.
 */
function chooseBestWall(game, me, opponents) {
    // Find the leading opponent (shortest distance to their goal)
    let leadOpp = opponents[0];
    let leadDist = Infinity;
    for (const opp of opponents) {
        const d = bfs(opp.row, opp.col, opp.goalTest, game.rows, game.cols, game.blockedEdges);
        if (d < leadDist) {
            leadDist = d;
            leadOpp = opp;
        }
    }

    // Sample candidate walls (limit for performance on 16×16)
    const maxCandidates = 60;
    const candidates = sampleValidWalls(game, maxCandidates);
    if (candidates.length === 0) return null;

    const myDist = bfs(me.row, me.col, me.goalTest, game.rows, game.cols, game.blockedEdges);
    let bestWall = null;
    let bestIncrease = 0;

    for (const [orient, r, c] of candidates) {
        // Temporarily place the wall
        const edges = game._wallEdges(orient, r, c);
        for (const e of edges) game.blockedEdges.add(e);

        const newOppDist = bfs(leadOpp.row, leadOpp.col, leadOpp.goalTest, game.rows, game.cols, game.blockedEdges);
        const newMyDist = bfs(me.row, me.col, me.goalTest, game.rows, game.cols, game.blockedEdges);

        for (const e of edges) game.blockedEdges.delete(e);

        // Positive = good: opponent's path increased more than ours
        const increase = (newOppDist - leadDist) - (newMyDist - myDist) * 0.5;

        if (increase > bestIncrease) {
            bestIncrease = increase;
            bestWall = { type: 'wall', orient, row: r, col: c };
        }
    }

    // Only place a wall if it actually helps (increase > 0)
    return bestIncrease > 0 ? bestWall : null;
}

/**
 * Sample up to `max` random valid wall placements.
 */
function sampleValidWalls(game, max) {
    const all = [];
    const maxR = game.rows - 1;
    const maxC = game.cols - 1;

    // If board is small, just enumerate
    if (maxR * maxC * 2 <= max * 3) {
        return game.getAllValidWalls();
    }

    // Random sampling
    const tried = new Set();
    let attempts = 0;
    while (all.length < max && attempts < max * 5) {
        attempts++;
        const orient = Math.random() < 0.5 ? 'h' : 'v';
        const r = Math.floor(Math.random() * maxR);
        const c = Math.floor(Math.random() * maxC);
        const key = `${orient}_${r}_${c}`;
        if (tried.has(key)) continue;
        tried.add(key);
        if (game.isWallValid(orient, r, c)) {
            all.push([orient, r, c]);
        }
    }
    return all;
}
