// ─── CrossWall · Pathfinding Module ──────────────────────────────────────────
// BFS-based pathfinding with edge-blocking for wall validation.

/**
 * Create a normalized edge key between two adjacent cells.
 * Ensures consistent ordering: smaller (row,col) first.
 */
export function edgeKey(r1, c1, r2, c2) {
    if (r1 > r2 || (r1 === r2 && c1 > c2)) {
        return `${r2},${c2},${r1},${c1}`;
    }
    return `${r1},${c1},${r2},${c2}`;
}

/**
 * Check if movement between two adjacent cells is blocked.
 */
export function isBlocked(r1, c1, r2, c2, blockedEdges) {
    return blockedEdges.has(edgeKey(r1, c1, r2, c2));
}

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * BFS to find shortest distance from start to any cell passing goalTest.
 * Returns distance (number of steps) or Infinity if no path exists.
 */
export function bfs(startRow, startCol, goalTest, rows, cols, blockedEdges) {
    if (goalTest(startRow, startCol)) return 0;

    const visited = new Uint8Array(rows * cols);
    const queue = [];
    let head = 0;

    const startIdx = startRow * cols + startCol;
    visited[startIdx] = 1;
    queue.push(startRow, startCol, 0);

    while (head < queue.length) {
        const r = queue[head++];
        const c = queue[head++];
        const dist = queue[head++];

        for (let d = 0; d < 4; d++) {
            const nr = r + DIRS[d][0];
            const nc = c + DIRS[d][1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

            const nIdx = nr * cols + nc;
            if (visited[nIdx]) continue;
            if (isBlocked(r, c, nr, nc, blockedEdges)) continue;

            if (goalTest(nr, nc)) return dist + 1;

            visited[nIdx] = 1;
            queue.push(nr, nc, dist + 1);
        }
    }
    return Infinity;
}

/**
 * Check if any path exists from start to goal.
 */
export function hasPath(startRow, startCol, goalTest, rows, cols, blockedEdges) {
    return bfs(startRow, startCol, goalTest, rows, cols, blockedEdges) < Infinity;
}

/**
 * Get the full shortest path as an array of [row, col] pairs.
 * Returns null if no path exists.
 */
export function getShortestPath(startRow, startCol, goalTest, rows, cols, blockedEdges) {
    if (goalTest(startRow, startCol)) return [[startRow, startCol]];

    const visited = new Map();
    const queue = [[startRow, startCol]];
    const key = (r, c) => `${r},${c}`;
    visited.set(key(startRow, startCol), null);

    let head = 0;
    while (head < queue.length) {
        const [r, c] = queue[head++];

        for (let d = 0; d < 4; d++) {
            const nr = r + DIRS[d][0];
            const nc = c + DIRS[d][1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

            const nk = key(nr, nc);
            if (visited.has(nk)) continue;
            if (isBlocked(r, c, nr, nc, blockedEdges)) continue;

            visited.set(nk, key(r, c));

            if (goalTest(nr, nc)) {
                // Reconstruct path
                const path = [[nr, nc]];
                let cur = key(r, c);
                while (cur !== null) {
                    const parts = cur.split(',').map(Number);
                    path.unshift(parts);
                    cur = visited.get(cur);
                }
                return path;
            }
            queue.push([nr, nc]);
        }
    }
    return null;
}
