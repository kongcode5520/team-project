/* ========================================
   Maze Game - Two-Player Mode v3.3
   Data structure: 2D array/matrix for maze grid
   0 = path, 1 = wall

   Player 1 = Green  (WASD keys)
   Player 2 = Blue   (Arrow keys)

   v3.3: Multiple potions on harder difficulties (Hell=2, Heaven=3).
   v3.2: Single-player / two-player mode toggle button.
   v3.1: Toggle button to enable/disable monster generation.
   v3.0: Monster units patrol three-way intersections.
         Touching a monster resets player to spawn (1,1).

   API deps:
   - GET  /api/maze/generate  (Player C, port 5001)
   - POST /api/score          (Player D, port 5002)
   ======================================== */

// ==================== DOM Elements ====================
var canvas = document.getElementById('mazeCanvas');
var ctx = canvas.getContext('2d');
var timer1El = document.getElementById('timer1');
var timer2El = document.getElementById('timer2');
var player1NameInput = document.getElementById('player1Name');
var player2NameInput = document.getElementById('player2Name');
var levelSelect = document.getElementById('levelSelect');
var regenBtn = document.getElementById('regenerateBtn');
var fogToggleBtn = document.getElementById('fogToggleBtn');
var monsterToggleBtn = document.getElementById('monsterToggleBtn');
var modeToggleBtn = document.getElementById('modeToggleBtn');
var player2Panel = document.getElementById('player2Panel');
var vsDivider = document.getElementById('vsDivider');
var statusEl = document.getElementById('gameStatus');

// ==================== Game State ====================
var maze = [];
var mazeWidth = 21;
var mazeHeight = 21;
var cellSize = 20;
var endRow = 1;
var endCol = 1;
var offsetX = 0;
var offsetY = 0;
var isLoading = false;

// Fog of War state
var fogEnabled = true;
var fogRadius = 3;  // Cells visible around each player

// Game mode state
var twoPlayerMode = true;  // true = two-player, false = single-player

// Monster toggle state
var monstersEnabled = true;

// Full Map Vision Potion state (array for multiple potions on hard difficulties)
var potions = [];  // Array of {row, col, active}
var fullVisionUntil = 0;  // timestamp (ms) when full vision expires, 0 = inactive
var potionPulseAnim = null;  // animation interval handle

// Two player states
// Data structure: Objects with independent position/timer/finished state
var players = [
    { row: 1, col: 1, startTime: null, elapsed: 0, interval: null,
      started: false, finished: false, color: '#4ecca3', outline: '#2d8a6e',
      name: 'Player 1', label: 'P1' },
    { row: 1, col: 1, startTime: null, elapsed: 0, interval: null,
      started: false, finished: false, color: '#4e8cff', outline: '#2d5ecc',
      name: 'Player 2', label: 'P2' }
];

// ==================== Monster State ====================
// Data structure: Array of monster objects, each with position, patrol route, and movement state
var monsters = [];
var monsterInterval = null;
var monsterSpeed = 600;  // Base movement interval in ms (adjusted by map size)

// ==================== Maze Generation (Local DFS Stack) ====================

function generateMaze(w, h) {
    if (w % 2 === 0) w++;
    if (h % 2 === 0) h++;

    var grid = [];
    for (var r = 0; r < h; r++) {
        grid[r] = [];
        for (var c = 0; c < w; c++) {
            grid[r][c] = 1;
        }
    }

    grid[1][1] = 0;
    // Data structure: Stack for DFS backtracking
    var stack = [[1, 1]];

    while (stack.length > 0) {
        var cur = stack[stack.length - 1];
        var cx = cur[0], cy = cur[1];

        var neighbors = [];
        var dirs = [[0, 2], [2, 0], [0, -2], [-2, 0]];
        for (var d = 0; d < dirs.length; d++) {
            var nx = cx + dirs[d][0];
            var ny = cy + dirs[d][1];
            if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && grid[ny][nx] === 1) {
                neighbors.push([nx, ny]);
            }
        }

        if (neighbors.length > 0) {
            var next = neighbors[Math.floor(Math.random() * neighbors.length)];
            var wx = (cx + next[0]) / 2;
            var wy = (cy + next[1]) / 2;
            grid[wy][wx] = 0;
            grid[next[1]][next[0]] = 0;
            stack.push(next);
        } else {
            stack.pop();
        }
    }

    // Ensure all three possible exit corners are paths
    // (exit is randomly chosen in setupGame from these three, excluding spawn at 1,1)
    grid[1][w - 2] = 0;         // top-right
    grid[h - 2][1] = 0;         // bottom-left
    grid[h - 2][w - 2] = 0;     // bottom-right
    return grid;
}

// ==================== Potion Placement ====================

/**
 * Returns number of potions based on map size.
 * Hell (41) = 2 potions, Heaven (51) = 3 potions, others = 1.
 */
function getPotionCount(mapSize) {
    if (mapSize >= 51) return 3;   // Heaven
    if (mapSize >= 41) return 2;   // Hell
    return 1;                       // Easy / Medium / Hard
}

function placePotions() {
    // Cancel any active effect
    potions = [];
    fullVisionUntil = 0;

    var count = getPotionCount(mazeWidth);

    // Collect all valid path cells (not start, not end, not too close to either)
    var pathCells = [];
    for (var r = 0; r < mazeHeight; r++) {
        for (var c = 0; c < mazeWidth; c++) {
            if (maze[r][c] === 0 &&
                !(r === 1 && c === 1) &&
                !(r === endRow && c === endCol)) {

                // Ensure potion is at least 5 steps (Manhattan) away from start and end
                var dStart = Math.abs(r - 1) + Math.abs(c - 1);
                var dEnd = Math.abs(r - endRow) + Math.abs(c - endCol);
                if (dStart > 5 && dEnd > 5) {
                    pathCells.push({row: r, col: c});
                }
            }
        }
    }

    if (pathCells.length === 0) {
        console.log('[Maze] No suitable cell for any potion');
        return;
    }

    // Limit count to available cells
    count = Math.min(count, pathCells.length);

    // Spread potions apart: shuffle candidates, greedily pick spaced cells
    for (var i = pathCells.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = pathCells[i];
        pathCells[i] = pathCells[j];
        pathCells[j] = tmp;
    }

    var minPotionDist = 8;  // Minimum Manhattan distance between potions
    for (var i = 0; i < pathCells.length && potions.length < count; i++) {
        var candidate = pathCells[i];
        var tooClose = false;
        for (var s = 0; s < potions.length; s++) {
            var dist = Math.abs(candidate.row - potions[s].row) +
                       Math.abs(candidate.col - potions[s].col);
            if (dist < minPotionDist) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) {
            potions.push({row: candidate.row, col: candidate.col, active: true});
            console.log('[Maze] Potion #' + potions.length + ' placed at (' + candidate.row + ', ' + candidate.col + ')');
        }
    }

    console.log('[Maze] Placed ' + potions.length + ' potion(s) (map size: ' + mazeWidth + ')');
}

function collectPotion(p, potionObj) {
    // Remove this specific potion from the array
    for (var i = 0; i < potions.length; i++) {
        if (potions[i].row === potionObj.row && potions[i].col === potionObj.col) {
            potions.splice(i, 1);
            break;
        }
    }
    fullVisionUntil = Date.now() + 3000;  // 3 seconds of full vision
    console.log('[Maze] ' + p.name + ' collected potion! Full vision for 3s (' + potions.length + ' remaining)');

    // Show status message
    if (!players[0].finished || (twoPlayerMode && !players[1].finished)) {
        statusEl.textContent = p.name + ' found a vision potion! 🧪';
    }

    // Show indicator
    var indicator = document.getElementById('visionIndicator');
    if (indicator) {
        indicator.style.display = 'inline-block';
        indicator.classList.add('active');
    }

    // If fog is disabled, potion has no visual effect (everything is already visible)
    if (!fogEnabled) {
        console.log('[Maze] Fog is off — potion has no effect while fog is disabled');
    }

    renderMaze();
}

function updateVisionIndicator() {
    var indicator = document.getElementById('visionIndicator');
    if (!indicator) return;

    if (Date.now() < fullVisionUntil && fogEnabled) {
        var remaining = ((fullVisionUntil - Date.now()) / 1000).toFixed(1);
        indicator.textContent = '🧪 ' + remaining + 's';
        indicator.style.display = 'inline-block';
        indicator.classList.add('active');
    } else {
        indicator.style.display = 'none';
        indicator.classList.remove('active');
    }
}

function startPotionAnimation() {
    if (potionPulseAnim) clearInterval(potionPulseAnim);
    potionPulseAnim = setInterval(function() {
        updateVisionIndicator();
        // Re-render if potions exist (for pulse animation) or vision is active (countdown)
        if (potions.length > 0 || Date.now() < fullVisionUntil) {
            renderMaze();
        }
        // When vision just expired, one final render to restore fog
        if (Date.now() >= fullVisionUntil && Date.now() - fullVisionUntil < 200) {
            renderMaze();
            updateVisionIndicator();
            // Restore status text
            if (statusEl.textContent.indexOf('🧪') === 0) {
                statusEl.textContent = 'Go!';
            }
        }
    }, 150);
}

// ==================== Monster System ====================

/**
 * Detect all three-way intersections in the current maze.
 * A three-way intersection is a path cell (0) with exactly 3 adjacent path cells.
 * @returns {Array<{row: number, col: number}>}
 */
function detectThreeWayIntersections() {
    var intersections = [];
    for (var r = 1; r < mazeHeight - 1; r++) {
        for (var c = 1; c < mazeWidth - 1; c++) {
            if (maze[r][c] !== 0) continue;
            var pathCount = 0;
            if (maze[r - 1][c] === 0) pathCount++;
            if (maze[r + 1][c] === 0) pathCount++;
            if (maze[r][c - 1] === 0) pathCount++;
            if (maze[r][c + 1] === 0) pathCount++;
            if (pathCount === 3) {
                intersections.push({row: r, col: c});
            }
        }
    }
    return intersections;
}

/**
 * Calculate how many monsters to spawn based on map size and available intersections.
 * Larger maps → higher proportion of intersections get monsters.
 * @param {number} totalIntersections - Total three-way intersections found
 * @param {number} mapSize - Width/height of the maze
 * @returns {number} Number of monsters to spawn
 */
function getMonsterCount(totalIntersections, mapSize) {
    if (totalIntersections === 0) return 0;

    var ratio, minMonsters, maxMonsters;
    if (mapSize <= 11) {
        ratio = 0.30; minMonsters = 1; maxMonsters = 2;
    } else if (mapSize <= 21) {
        ratio = 0.35; minMonsters = 1; maxMonsters = 4;
    } else if (mapSize <= 31) {
        ratio = 0.40; minMonsters = 2; maxMonsters = 6;
    } else if (mapSize <= 41) {
        ratio = 0.45; minMonsters = 3; maxMonsters = 8;
    } else {
        ratio = 0.50; minMonsters = 3; maxMonsters = 10;
    }

    var count = Math.floor(totalIntersections * ratio);
    count = Math.max(minMonsters, Math.min(count, maxMonsters));
    count = Math.min(count, totalIntersections);
    return count;
}

/**
 * Adjust monster movement speed based on map size.
 * Larger maps → faster monsters (lower interval).
 * @param {number} mapSize
 * @returns {number} Movement interval in ms
 */
function getMonsterSpeed(mapSize) {
    if (mapSize <= 11) return 800;
    if (mapSize <= 21) return 650;
    if (mapSize <= 31) return 550;
    if (mapSize <= 41) return 450;
    return 400;
}

/**
 * Build a patrol route that cycles through all three branches of the intersection.
 * The monster moves at most MAX_STEPS cells out from the intersection along each branch,
 * then returns. This keeps patrols short and prevents permanent corridor blocking —
 * the monster repeatedly passes through the intersection, giving players a chance to cross.
 *
 * Route pattern: [I, →1, →2, ←1, I, →(branch2)1, →2, ←1, I, →(branch3)1, →2, ←1, I]
 *
 * @param {{row: number, col: number}} intersection
 * @returns {Array<{row: number, col: number}>} Ordered patrol route cells
 */
function buildPatrolRoute(intersection) {
    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    var MAX_STEPS = 2;  // Maximum cells to move out from intersection per branch

    // Collect valid exit directions from the intersection
    var validDirs = [];
    for (var d = 0; d < dirs.length; d++) {
        var nr = intersection.row + dirs[d][0];
        var nc = intersection.col + dirs[d][1];
        if (nr >= 0 && nr < mazeHeight && nc >= 0 && nc < mazeWidth && maze[nr][nc] === 0) {
            validDirs.push(dirs[d]);
        }
    }

    if (validDirs.length === 0) {
        return [{row: intersection.row, col: intersection.col}];
    }

    // Shuffle directions so monsters patrol branches in random order
    for (var i = validDirs.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = validDirs[i];
        validDirs[i] = validDirs[j];
        validDirs[j] = tmp;
    }

    // Start the route at the intersection
    var route = [{row: intersection.row, col: intersection.col}];

    // For each of the 3 branches: walk out up to MAX_STEPS, then walk back to the intersection
    for (var b = 0; b < validDirs.length; b++) {
        var dr = validDirs[b][0];
        var dc = validDirs[b][1];

        // Collect up to MAX_STEPS reachable path cells along this direction
        var branchCells = [];
        var curR = intersection.row + dr;
        var curC = intersection.col + dc;

        for (var step = 0; step < MAX_STEPS; step++) {
            // Stop at walls, out of bounds, or non-path cells
            if (curR < 0 || curR >= mazeHeight || curC < 0 || curC >= mazeWidth || maze[curR][curC] !== 0) {
                break;
            }
            branchCells.push({row: curR, col: curC});
            curR += dr;
            curC += dc;
        }

        if (branchCells.length === 0) continue;  // No reachable path in this direction

        // Walk out along the branch
        for (var k = 0; k < branchCells.length; k++) {
            route.push(branchCells[k]);
        }

        // Walk back to the intersection (reverse order)
        for (var k = branchCells.length - 1; k >= 0; k--) {
            route.push(branchCells[k]);
        }

        // Return to intersection before heading out next branch
        route.push({row: intersection.row, col: intersection.col});
    }

    return route;
}

/**
 * Generate and place monsters on selected three-way intersections.
 * Selection logic:
 *   - Exclude intersections too close to start (1,1) or end point
 *   - Spread monsters apart (minimum Manhattan distance between them)
 *   - Count is proportional to map size
 */
function generateMonsters() {
    monsters = [];

    var intersections = detectThreeWayIntersections();
    console.log('[Monster] Found ' + intersections.length + ' three-way intersections');

    if (intersections.length === 0) return;

    var targetCount = getMonsterCount(intersections.length, mazeWidth);
    console.log('[Monster] Target count: ' + targetCount + ' (map size: ' + mazeWidth + ')');

    // Filter: exclude intersections too close to start or end
    var minDistFromKey = 4;  // Minimum Manhattan distance from start/end
    var candidates = intersections.filter(function(inter) {
        var dStart = Math.abs(inter.row - 1) + Math.abs(inter.col - 1);
        var dEnd = Math.abs(inter.row - endRow) + Math.abs(inter.col - endCol);
        return dStart >= minDistFromKey && dEnd >= minDistFromKey;
    });

    console.log('[Monster] Candidates after distance filter: ' + candidates.length);

    // Shuffle candidates (Fisher-Yates)
    for (var i = candidates.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
    }

    // Greedy selection: pick intersections at least 3 cells apart
    var selected = [];
    var minMonsterDist = 3;
    for (var i = 0; i < candidates.length && selected.length < targetCount; i++) {
        var candidate = candidates[i];
        var tooClose = false;
        for (var s = 0; s < selected.length; s++) {
            var dist = Math.abs(candidate.row - selected[s].row) +
                       Math.abs(candidate.col - selected[s].col);
            if (dist < minMonsterDist) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) {
            selected.push(candidate);
        }
    }

    console.log('[Monster] Selected ' + selected.length + ' intersections for monsters');

    // Create monster objects
    for (var i = 0; i < selected.length; i++) {
        var route = buildPatrolRoute(selected[i]);
        // Start at a random position along the route
        var startIdx = Math.floor(Math.random() * route.length);
        monsters.push({
            row: route[startIdx].row,
            col: route[startIdx].col,
            route: route,
            routeIndex: startIdx,
            direction: Math.random() < 0.5 ? 1 : -1,
            color: '#e94560',
            glowColor: '#ff0040'
        });
    }

    console.log('[Monster] Generated ' + monsters.length + ' monsters');
    for (var i = 0; i < monsters.length; i++) {
        console.log('[Monster]   #' + (i + 1) + ' at (' + monsters[i].row + ',' + monsters[i].col +
                    '), route length: ' + monsters[i].route.length);
    }
}

/**
 * Move all monsters one step along their patrol routes.
 * Checks for player collisions after each move.
 */
function moveMonsters() {
    if (monsters.length === 0) return;

    for (var i = 0; i < monsters.length; i++) {
        var m = monsters[i];
        if (m.route.length <= 1) continue;  // Stationary monster

        // Update route index
        m.routeIndex += m.direction;

        // Bounce at route endpoints
        if (m.routeIndex >= m.route.length) {
            m.routeIndex = m.route.length - 2;
            m.direction = -1;
        } else if (m.routeIndex < 0) {
            m.routeIndex = 1;
            m.direction = 1;
        }

        m.row = m.route[m.routeIndex].row;
        m.col = m.route[m.routeIndex].col;

        // Check collision with both players after monster moves
        for (var p = 0; p < 2; p++) {
            if (!players[p].finished &&
                players[p].row === m.row &&
                players[p].col === m.col) {
                respawnPlayer(p);
            }
        }
    }

    renderMaze();
}

/**
 * Respawn a player at the starting point after touching a monster.
 * @param {number} pIndex - Player index (0 or 1)
 */
function respawnPlayer(pIndex) {
    var p = players[pIndex];
    p.row = 1;
    p.col = 1;
    statusEl.textContent = '💀 ' + p.name + ' was caught by a monster! Back to start!';
    console.log('[Monster] ' + p.name + ' respawned at start');
}

/**
 * Start the monster movement interval.
 */
function startMonsterMovement() {
    stopMonsterMovement();
    if (monsters.length === 0) return;

    monsterSpeed = getMonsterSpeed(mazeWidth);
    console.log('[Monster] Starting movement interval: ' + monsterSpeed + 'ms');
    monsterInterval = setInterval(moveMonsters, monsterSpeed);
}

/**
 * Stop the monster movement interval.
 */
function stopMonsterMovement() {
    if (monsterInterval) {
        clearInterval(monsterInterval);
        monsterInterval = null;
    }
}

// ==================== API Calls ====================

function fetchMazeFromAPI(width, height, callback) {
    var url = 'http://localhost:5001/api/maze/generate?width=' + width + '&height=' + height;
    console.log('[Maze] Fetching from API:', url);

    var xhr = new XMLHttpRequest();
    xhr.timeout = 5000;
    xhr.open('GET', url, true);

    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                var data = JSON.parse(xhr.responseText);
                if (data && data.maze) {
                    console.log('[Maze] API returned maze:', data.width, 'x', data.height);
                    callback(data);
                    return;
                }
            } catch (e) { console.warn('[Maze] API parse error:', e); }
        }
        callback(null);
    };
    xhr.onerror = function() { callback(null); };
    xhr.ontimeout = function() { callback(null); };
    xhr.send();
}

function submitScore(playerName, time, level) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://localhost:5002/api/score', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onload = function() {
        if (xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            console.log('[Maze] Score for', playerName, data.success ? 'saved' : 'failed');
        }
    };
    xhr.onerror = function() { console.warn('[Maze] Score submit network error'); };

    xhr.send(JSON.stringify({ player: playerName, time: time, level: level }));
}

// ==================== Render Engine ====================

function renderMaze() {
    var canvasSize = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.78);
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    cellSize = Math.floor(canvasSize / Math.max(mazeWidth, mazeHeight));
    offsetX = Math.floor((canvasSize - mazeWidth * cellSize) / 2);
    offsetY = Math.floor((canvasSize - mazeHeight * cellSize) / 2);

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // Draw grid
    for (var row = 0; row < mazeHeight; row++) {
        for (var col = 0; col < mazeWidth; col++) {
            var x = offsetX + col * cellSize;
            var y = offsetY + row * cellSize;
            ctx.fillStyle = (maze[row][col] === 1) ? '#3a3a4a' : '#f0f0f0';
            ctx.fillRect(x, y, cellSize, cellSize);
        }
    }

    // Check if full vision potion is active
    var hasFullVision = Date.now() < fullVisionUntil;

    // ---- Fog of War overlay ----
    if (fogEnabled && !hasFullVision) {
        for (var row = 0; row < mazeHeight; row++) {
            for (var col = 0; col < mazeWidth; col++) {
                // Calculate Chebyshev distance (square vision) to nearest player
                var d1 = Math.max(Math.abs(row - players[0].row), Math.abs(col - players[0].col));
                var minDist;
                if (twoPlayerMode) {
                    var d2 = Math.max(Math.abs(row - players[1].row), Math.abs(col - players[1].col));
                    minDist = Math.min(d1, d2);
                } else {
                    minDist = d1;
                }

                if (minDist > fogRadius) {
                    // Full fog — completely hidden, fully opaque
                    var x = offsetX + col * cellSize;
                    var y = offsetY + row * cellSize;
                    ctx.fillStyle = '#0a0a1e';
                    ctx.fillRect(x, y, cellSize, cellSize);
                } else if (minDist === fogRadius) {
                    // Edge fade — heavy mist, barely visible
                    var x = offsetX + col * cellSize;
                    var y = offsetY + row * cellSize;
                    ctx.fillStyle = 'rgba(10, 10, 30, 0.75)';
                    ctx.fillRect(x, y, cellSize, cellSize);
                }
                // dist < fogRadius: no overlay, cell is fully visible
            }
        }
    }

    // Draw end point (gold) — only visible when within fog range of a player
    var endDist1 = Math.max(Math.abs(endRow - players[0].row), Math.abs(endCol - players[0].col));
    var endMinDist;
    if (twoPlayerMode) {
        var endDist2 = Math.max(Math.abs(endRow - players[1].row), Math.abs(endCol - players[1].col));
        endMinDist = Math.min(endDist1, endDist2);
    } else {
        endMinDist = endDist1;
    }
    if (!fogEnabled || hasFullVision || endMinDist <= fogRadius) {
        var ex = offsetX + endCol * cellSize;
        var ey = offsetY + endRow * cellSize;
        ctx.fillStyle = '#e9c46a';
        ctx.fillRect(ex + 2, ey + 2, cellSize - 4, cellSize - 4);
    }

    // ---- Draw monsters ----
    for (var i = 0; i < monsters.length; i++) {
        var m = monsters[i];
        // Monster visible if: fog disabled, full vision active, or within fog range
        var monsterVisible = !fogEnabled || hasFullVision;
        if (!monsterVisible) {
            var md1 = Math.max(Math.abs(m.row - players[0].row), Math.abs(m.col - players[0].col));
            if (twoPlayerMode) {
                var md2 = Math.max(Math.abs(m.row - players[1].row), Math.abs(m.col - players[1].col));
                monsterVisible = Math.min(md1, md2) <= fogRadius;
            } else {
                monsterVisible = md1 <= fogRadius;
            }
        }
        if (monsterVisible) {
            drawMonster(m);
        }
    }

    // ---- Draw potions ----
    for (var pi = 0; pi < potions.length; pi++) {
        var pot = potions[pi];
        // Potion is visible: fog is off, OR full vision is active, OR within extended range
        var potionVisible = !fogEnabled || hasFullVision;
        if (!potionVisible) {
            var pd1 = Math.max(Math.abs(pot.row - players[0].row), Math.abs(pot.col - players[0].col));
            if (twoPlayerMode) {
                var pd2 = Math.max(Math.abs(pot.row - players[1].row), Math.abs(pot.col - players[1].col));
                potionVisible = Math.min(pd1, pd2) <= fogRadius + 2;
            } else {
                potionVisible = pd1 <= fogRadius + 2;
            }
        }
        if (potionVisible) {
            drawPotion(pot);
        }
    }

    // Draw players (always visible)
    drawPlayer(players[0]);
    if (twoPlayerMode) {
        drawPlayer(players[1]);
    }
}

function drawPotion(p) {
    var px = offsetX + p.col * cellSize + cellSize / 2;
    var py = offsetY + p.row * cellSize + cellSize / 2;
    var size = cellSize * 0.4;

    // Pulse effect
    var pulse = Math.sin(Date.now() / 300) * 0.15 + 1;
    var glowSize = size * pulse;

    // Outer glow
    ctx.shadowColor = '#e040fb';
    ctx.shadowBlur = glowSize * 2;

    // Potion body (diamond)
    ctx.fillStyle = '#ce3fff';
    ctx.beginPath();
    ctx.moveTo(px, py - size);
    ctx.lineTo(px + size * 0.55, py);
    ctx.lineTo(px, py + size);
    ctx.lineTo(px - size * 0.55, py);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f0a0ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Bottle neck
    ctx.fillStyle = '#e0a0ff';
    var neckW = size * 0.22;
    var neckH = size * 0.35;
    ctx.fillRect(px - neckW, py - size - neckH, neckW * 2, neckH);
    ctx.strokeStyle = '#f0a0ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - neckW, py - size - neckH, neckW * 2, neckH);

    // Cork
    ctx.fillStyle = '#c8a060';
    ctx.fillRect(px - neckW * 0.8, py - size - neckH - size * 0.15, neckW * 1.6, size * 0.2);

    // Inner sparkle / "?" mark
    if (cellSize >= 16) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.max(7, size * 0.5) + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', px, py);
    }

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
}

function drawPlayer(p) {
    var px = offsetX + p.col * cellSize + cellSize / 2;
    var py = offsetY + p.row * cellSize + cellSize / 2;
    var pr = Math.max(4, cellSize * 0.35);

    // Body
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    if (cellSize >= 16) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.max(8, cellSize * 0.3) + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, px, py);
    }

    // Checkmark if finished
    if (p.finished) {
        ctx.fillStyle = '#4ecca3';
        ctx.font = Math.max(10, cellSize * 0.5) + 'px Arial';
        ctx.fillText('V', px + cellSize * 0.35, py - cellSize * 0.35);
    }
}

function drawMonster(m) {
    var mx = offsetX + m.col * cellSize + cellSize / 2;
    var my = offsetY + m.row * cellSize + cellSize / 2;
    var size = cellSize * 0.38;

    // Glow effect
    ctx.shadowColor = m.glowColor;
    ctx.shadowBlur = size * 2;

    // Body (diamond / bat shape)
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.moveTo(mx, my - size);               // top
    ctx.lineTo(mx + size * 0.65, my);        // right
    ctx.lineTo(mx, my + size);               // bottom
    ctx.lineTo(mx - size * 0.65, my);        // left
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ff6b81';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Eyes
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    var eyeSize = Math.max(2, size * 0.22);
    var eyeOffsetX = size * 0.22;
    var eyeOffsetY = size * 0.15;

    // Eye whites
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(mx - eyeOffsetX, my - eyeOffsetY, eyeSize, 0, Math.PI * 2);
    ctx.arc(mx + eyeOffsetX, my - eyeOffsetY, eyeSize, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(mx - eyeOffsetX, my - eyeOffsetY, eyeSize * 0.55, 0, Math.PI * 2);
    ctx.arc(mx + eyeOffsetX, my - eyeOffsetY, eyeSize * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // Mouth (small jagged line)
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = Math.max(1, size * 0.15);
    ctx.beginPath();
    var mouthY = my + size * 0.25;
    ctx.moveTo(mx - size * 0.2, mouthY);
    ctx.lineTo(mx - size * 0.07, mouthY + size * 0.12);
    ctx.lineTo(mx + size * 0.07, mouthY);
    ctx.lineTo(mx + size * 0.2, mouthY + size * 0.12);
    ctx.stroke();
    ctx.lineWidth = 1;

    // Label text
    if (cellSize >= 16) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.max(6, size * 0.35) + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('M', mx, my + size * 0.55);
    }
}

// ==================== Timer ====================

function updatePlayerTimer(p, timerEl) {
    if (p.startTime !== null && !p.finished) {
        p.elapsed = Math.floor((Date.now() - p.startTime) / 1000);
    }
    timerEl.textContent = p.elapsed;
}

function startPlayerTimer(p) {
    if (p.started) return;
    p.started = true;
    p.startTime = Date.now();
    p.interval = setInterval(function() { updatePlayerTimer(p, p.timerEl); }, 200);
}

function stopPlayerTimer(p) {
    if (p.interval) { clearInterval(p.interval); p.interval = null; }
    updatePlayerTimer(p, p.timerEl);
}

function resetPlayerTimer(p) {
    stopPlayerTimer(p);
    p.startTime = null;
    p.elapsed = 0;
    p.started = false;
    p.finished = false;
    p.timerEl.textContent = '0';
}

// ==================== Player Movement ====================

function movePlayer(pIndex, dRow, dCol) {
    var p = players[pIndex];
    if (p.finished) return; // Already done

    var nr = p.row + dRow;
    var nc = p.col + dCol;

    if (nr < 0 || nr >= mazeHeight || nc < 0 || nc >= mazeWidth) return;
    if (maze[nr][nc] === 1) return; // Wall collision

    p.row = nr;
    p.col = nc;

    // Check potion collection
    for (var pi = 0; pi < potions.length; pi++) {
        if (p.row === potions[pi].row && p.col === potions[pi].col) {
            collectPotion(p, potions[pi]);
            break;
        }
    }

    // Check monster collision
    for (var i = 0; i < monsters.length; i++) {
        if (p.row === monsters[i].row && p.col === monsters[i].col) {
            respawnPlayer(pIndex);
            renderMaze();
            return;
        }
    }

    renderMaze();

    // Check reach end
    if (p.row === endRow && p.col === endCol) {
        p.finished = true;
        stopPlayerTimer(p);
        renderMaze();
        checkGameOver();
    }
}

function checkGameOver() {
    // Single player mode: P1 reaching end = immediate game over
    if (!twoPlayerMode) {
        if (players[0].finished) {
            var t1 = players[0].elapsed;
            statusEl.textContent = '🏆 ' + players[0].name + ' completed in ' + t1 + 's!';
            console.log('[Maze] Game over (single):', players[0].name, t1 + 's');

            var size = parseInt(levelSelect.value);
            var levelMap = {11: 1, 21: 2, 31: 3, 41: 4, 51: 5};
            var level = levelMap[size] || 1;
            submitScore(players[0].name, t1, level);
        }
        return;
    }

    // Two player mode: original logic
    if (players[0].finished && players[1].finished) {
        // Both finished, compare times
        var t1 = players[0].elapsed;
        var t2 = players[1].elapsed;
        var msg;
        if (t1 < t2) {
            msg = players[0].name + ' wins! (' + t1 + 's vs ' + t2 + 's)';
        } else if (t2 < t1) {
            msg = players[1].name + ' wins! (' + t2 + 's vs ' + t1 + 's)';
        } else {
            msg = 'Tie! Both finished in ' + t1 + 's';
        }
        statusEl.textContent = msg;
        console.log('[Maze] Game over:', msg);

        // Submit both scores
        var size = parseInt(levelSelect.value);
        var levelMap = {11: 1, 21: 2, 31: 3, 41: 4, 51: 5};
        var level = levelMap[size] || 1;

        submitScore(players[0].name, t1, level);
        submitScore(players[1].name, t2, level);
    } else if (players[0].finished && !players[1].finished) {
        statusEl.textContent = players[0].name + ' reached! Waiting for ' + players[1].name + '...';
    } else if (!players[0].finished && players[1].finished) {
        statusEl.textContent = players[1].name + ' reached! Waiting for ' + players[0].name + '...';
    }
}

// ==================== Game Init & Reset ====================

/**
 * Update UI visibility based on single/two-player mode.
 */
function updateModeUI() {
    if (twoPlayerMode) {
        player2Panel.style.display = '';
        vsDivider.style.display = '';
        modeToggleBtn.textContent = '👥 单人模式';
        modeToggleBtn.classList.remove('single-mode');
    } else {
        player2Panel.style.display = 'none';
        vsDivider.style.display = 'none';
        modeToggleBtn.textContent = '👤 双人模式';
        modeToggleBtn.classList.add('single-mode');
        // P2 is not active in single mode
        players[1].finished = false;
        stopPlayerTimer(players[1]);
        players[1].elapsed = 0;
        timer2El.textContent = '0';
    }
}

function setupGame() {
    // Reset both players
    players[0].row = 1; players[0].col = 1;
    players[1].row = 1; players[1].col = 1;

    if (maze[1] && maze[1][1] !== undefined) {
        maze[1][1] = 0;
    }

    // Randomly pick exit from three corners (excluding spawn at top-left 1,1)
    var exitCorners = [
        {row: 1, col: mazeWidth - 2},              // top-right
        {row: mazeHeight - 2, col: 1},             // bottom-left
        {row: mazeHeight - 2, col: mazeWidth - 2}  // bottom-right
    ];
    var chosen = exitCorners[Math.floor(Math.random() * exitCorners.length)];
    endRow = chosen.row;
    endCol = chosen.col;
    if (endRow < 1) endRow = 1;
    if (endCol < 1) endCol = 1;
    if (maze[endRow] && maze[endRow][endCol] !== undefined) {
        maze[endRow][endCol] = 0;
    }

    // Reset timers
    players[0].timerEl = timer1El;
    players[1].timerEl = timer2El;
    resetPlayerTimer(players[0]);
    resetPlayerTimer(players[1]);

    // Read names
    var n1 = player1NameInput.value.trim();
    var n2 = player2NameInput.value.trim();
    players[0].name = n1 || 'Player 1';
    players[1].name = n2 || 'Player 2';

    statusEl.textContent = 'Go!';

    // Place full vision potion(s)
    placePotions();

    // Generate monsters on three-way intersections (only if enabled)
    stopMonsterMovement();
    monsters = [];
    if (monstersEnabled) {
        generateMonsters();
        startMonsterMovement();
    }

    // Apply mode UI
    updateModeUI();
}

function loadMaze() {
    if (isLoading) { console.log('[Maze] Already loading, skip'); return; }
    isLoading = true;

    var size = parseInt(levelSelect.value);

    // Step 1: Generate local maze immediately
    console.log('[Maze] Local generation, size:', size);
    maze = generateMaze(size, size);
    mazeWidth = size;
    mazeHeight = size;
    setupGame();
    renderMaze();
    regenBtn.textContent = 'New Maze';
    startPotionAnimation();

    // Step 2: Try API for better maze
    fetchMazeFromAPI(size, size, function(data) {
        if (data && data.maze) {
            console.log('[Maze] Replacing with API maze');
            maze = data.maze;
            mazeWidth = data.width;
            mazeHeight = data.height;
            // Keep both players at their current positions, just update maze
            setupGame();
            renderMaze();
        }
        regenBtn.disabled = false;
        regenBtn.textContent = 'New Maze';
        isLoading = false;
    });

    // Fallback
    setTimeout(function() {
        if (isLoading) {
            regenBtn.disabled = false;
            regenBtn.textContent = 'New Maze';
            isLoading = false;
        }
    }, 6000);
}

// ==================== Event Listeners ====================

document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    // Check if game is already over
    if (twoPlayerMode) {
        if (players[0].finished && players[1].finished) return;
    } else {
        if (players[0].finished) return;
    }

    // ---- Player 1: WASD ----
    var p1dRow = 0, p1dCol = 0;
    switch (e.key.toLowerCase()) {
        case 'w': p1dRow = -1; break;
        case 's': p1dRow = 1;  break;
        case 'a': p1dCol = -1; break;
        case 'd': p1dCol = 1;  break;
    }

    if (p1dRow !== 0 || p1dCol !== 0) {
        e.preventDefault();
        if (!players[0].started) startPlayerTimer(players[0]);
        movePlayer(0, p1dRow, p1dCol);
        return;
    }

    // ---- Player 2: Arrow keys (two-player mode only) ----
    if (twoPlayerMode) {
        var p2dRow = 0, p2dCol = 0;
        switch (e.key) {
            case 'ArrowUp':    p2dRow = -1; break;
            case 'ArrowDown':  p2dRow = 1;  break;
            case 'ArrowLeft':  p2dCol = -1; break;
            case 'ArrowRight': p2dCol = 1;  break;
        }

        if (p2dRow !== 0 || p2dCol !== 0) {
            e.preventDefault();
            if (!players[1].started) startPlayerTimer(players[1]);
            movePlayer(1, p2dRow, p2dCol);
        }
    }
});

regenBtn.addEventListener('click', function() { loadMaze(); });
levelSelect.addEventListener('change', function() { loadMaze(); });

fogToggleBtn.addEventListener('click', function() {
    fogEnabled = !fogEnabled;
    if (fogEnabled) {
        fogToggleBtn.textContent = '🌫 关闭迷雾';
        fogToggleBtn.classList.remove('fog-off');
    } else {
        // Disabling fog also cancels any active potion full vision
        fullVisionUntil = 0;
        updateVisionIndicator();
        fogToggleBtn.textContent = '☀ 开启迷雾';
        fogToggleBtn.classList.add('fog-off');
    }
    renderMaze();
});

monsterToggleBtn.addEventListener('click', function() {
    monstersEnabled = !monstersEnabled;
    if (monstersEnabled) {
        monsterToggleBtn.textContent = '👾 关闭怪物';
        monsterToggleBtn.classList.remove('monster-off');
        // Regenerate monsters on current maze
        generateMonsters();
        startMonsterMovement();
        statusEl.textContent = '👾 Monsters enabled!';
    } else {
        monsterToggleBtn.textContent = '☮ 开启怪物';
        monsterToggleBtn.classList.add('monster-off');
        // Remove all monsters
        stopMonsterMovement();
        monsters = [];
        statusEl.textContent = '☮ Monsters disabled!';
    }
    renderMaze();
});

modeToggleBtn.addEventListener('click', function() {
    twoPlayerMode = !twoPlayerMode;
    updateModeUI();
    // Reset players and timers when switching modes (keep same maze)
    resetPlayerTimer(players[0]);
    resetPlayerTimer(players[1]);
    players[0].row = 1; players[0].col = 1;
    players[1].row = 1; players[1].col = 1;
    players[0].finished = false;
    players[1].finished = false;
    statusEl.textContent = 'Go!';
    renderMaze();
});

// ==================== Start ====================
loadMaze();
