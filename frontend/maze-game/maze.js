/* ========================================
   Maze Game - Two-Player Mode v4.2
   Data structure: 2D array/matrix for maze grid
   0 = path, 1 = wall

   Player 1 = Green  (WASD keys)
   Player 2 = Blue   (Arrow keys)

   v4.2: Flame pickups scattered across the map — collecting one
         reduces the cold progress bar. Flame count scales with map size.
   v4.1: Three-tier cold penalty — 1st=迷失方向(teleport nearby),
         2nd=雪怪赶跑(teleport to spawn), 3rd=冻死(reset map).
   v4.0.2: Potions tied to fog toggle — fog off = no potions generated.
   v4.0.1: Enhanced lost-direction notification — large prominent
           canvas overlay with frost effects, supports multi-player display.
   v4.0: Extreme Cold Mode — cold progress bar fills over time;
         when full, player is randomly teleported nearby (max 5 units)
         and shown "你在暴风雪中迷失方向".
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
var coldToggleBtn = document.getElementById('coldToggleBtn');
var modeToggleBtn = document.getElementById('modeToggleBtn');
var player2Panel = document.getElementById('player2Panel');
var vsDivider = document.getElementById('vsDivider');
var statusEl = document.getElementById('gameStatus');
var player1ColdStatusEl = document.getElementById('player1ColdStatus');
var player2ColdStatusEl = document.getElementById('player2ColdStatus');

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

// v4.2: Flame pickups — scattered across the map, reduce cold progress on pickup
var flames = [];  // Array of {row, col}

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

// ==================== Extreme Cold Mode State ====================
// v4.0: Cold mode — a cold progress bar fills over time per player.
// When full, the player is randomly teleported nearby (max 5 units)
// and shown "你在暴风雪中迷失方向". The bar then resets.
var coldModeEnabled = false;
var coldMaxProgress = 22000;   // 22 seconds for the bar to fill completely
var coldProgress = [0, 0];     // Per-player progress in ms: [P1, P2]
var coldPenaltyCount = [0, 0]; // v4.1: Per-player count of cold bar fills [P1, P2]
                               // 0→next=迷失方向, 1→next=雪怪回城, 2→next=冻死重置
var coldDeathPending = false;  // v4.1: true when Tier3 death animation is playing; freeze cold
var coldStatusTimers = [null, null]; // v4.1: Per-player timers to clear cold status text
var coldLastTick = null;       // Timestamp of last cold tick
var coldInterval = null;       // Interval handle for cold update

// v4.1: Lost direction notification queue — prominent overlay when penalty fires
// Each entry: {pIndex, timestamp, duration, tier}
//   tier 0 = 迷失方向, tier 1 = 雪怪赶跑, tier 2 = 冻死
var lostNotifications = [];     // Active lost-direction notification entries
var lostNotifyDuration = 3500; // How long each notification stays visible (ms)

// ==================== Extreme Cold Mode Logic ====================

/**
 * Start (or restart) the cold progress timer.
 */
function startColdMode() {
    stopColdMode();
    coldProgress = [0, 0];
    coldPenaltyCount = [0, 0];
    coldDeathPending = false;
    coldLastTick = Date.now();
    coldInterval = setInterval(updateColdProgress, 150);
    console.log('[Cold] Cold mode started (max progress: ' + coldMaxProgress + 'ms)');
}

/**
 * Stop the cold progress timer and reset progress.
 */
function stopColdMode() {
    if (coldInterval) {
        clearInterval(coldInterval);
        coldInterval = null;
    }
    coldProgress = [0, 0];
    coldPenaltyCount = [0, 0];
    coldLastTick = null;
    lostNotifications = [];
    // Clear per-player cold status
    for (var i = 0; i < 2; i++) {
        if (coldStatusTimers[i]) { clearTimeout(coldStatusTimers[i]); coldStatusTimers[i] = null; }
    }
    if (player1ColdStatusEl) player1ColdStatusEl.textContent = '';
    if (player2ColdStatusEl) player2ColdStatusEl.textContent = '';
}

/**
 * Called every tick (~150ms) to advance the cold meter for each active player.
 * When a player's meter fills, apply the penalty and reset their meter.
 */
function updateColdProgress() {
    if (!coldModeEnabled) return;
    if (coldDeathPending) return;  // v4.1: freeze during death animation

    var now = Date.now();
    if (coldLastTick === null) { coldLastTick = now; return; }
    var dt = now - coldLastTick;
    coldLastTick = now;

    // Clean up expired lost-direction notifications
    for (var n = lostNotifications.length - 1; n >= 0; n--) {
        if (now - lostNotifications[n].timestamp > lostNotifications[n].duration) {
            lostNotifications.splice(n, 1);
        }
    }

    for (var i = 0; i < 2; i++) {
        // Skip P2 in single-player mode
        if (!twoPlayerMode && i === 1) continue;
        // Skip finished players
        if (players[i].finished) continue;

        coldProgress[i] += dt;
        if (coldProgress[i] >= coldMaxProgress) {
            applyColdPenalty(i);
            coldProgress[i] = 0;
        }
    }
    renderMaze();
}

/**
 * Set a per-player cold status message that auto-clears after a delay.
 * @param {number} pIndex - Player index (0 or 1)
 * @param {string} msg - Status message to display
 * @param {number} durationMs - How long before auto-clear (default 4000ms)
 */
function setPlayerColdStatus(pIndex, msg, durationMs) {
    if (durationMs === undefined) durationMs = 4000;
    var el = (pIndex === 0) ? player1ColdStatusEl : player2ColdStatusEl;
    if (!el) return;
    el.textContent = msg;
    if (coldStatusTimers[pIndex]) clearTimeout(coldStatusTimers[pIndex]);
    coldStatusTimers[pIndex] = setTimeout(function() {
        el.textContent = '';
        coldStatusTimers[pIndex] = null;
    }, durationMs);
}

/**
 * v4.1 — Three-tier cold penalty system:
 *   1st fill (coldPenaltyCount=0): teleport nearby (max 5 cells), 迷失方向
 *   2nd fill (coldPenaltyCount=1): teleport to spawn (1,1), 被雪怪赶跑
 *   3rd fill (coldPenaltyCount=2): death — reset entire map (New Maze), 被冻死
 *
 * Each tier shows a different overlay message and per-player status.
 * After the 3rd fill the counter resets to 0 for the next round.
 *
 * @param {number} pIndex - Player index (0 or 1)
 */
function applyColdPenalty(pIndex) {
    // v4.1: If a death animation is already playing, don't start new penalties
    if (coldDeathPending) return;

    var p = players[pIndex];
    var tier = coldPenaltyCount[pIndex];

    if (tier === 0) {
        // === Tier 1: 在暴风雪中迷失方向 — teleport nearby (same as 4.0.2) ===
        Sound.play('cold', 0);
        var maxDist = 5;
        var validCells = [];
        for (var dr = -maxDist; dr <= maxDist; dr++) {
            for (var dc = -maxDist; dc <= maxDist; dc++) {
                if (dr === 0 && dc === 0) continue;
                var nr = p.row + dr;
                var nc = p.col + dc;
                if (nr >= 0 && nr < mazeHeight && nc >= 0 && nc < mazeWidth &&
                    maze[nr][nc] === 0) {
                    if (!(nr === endRow && nc === endCol)) {
                        validCells.push({row: nr, col: nc});
                    }
                }
            }
        }

        if (validCells.length > 0) {
            var target = validCells[Math.floor(Math.random() * validCells.length)];
            console.log('[Cold] ' + p.name + ' Tier1 迷失方向 — teleported from (' +
                        p.row + ',' + p.col + ') → (' + target.row + ',' + target.col + ')');
            p.row = target.row;
            p.col = target.col;
        } else {
            console.log('[Cold] ' + p.name + ' Tier1 penalty but no valid nearby cell');
        }

        lostNotifications.push({
            pIndex: pIndex,
            timestamp: Date.now(),
            duration: lostNotifyDuration,
            tier: 0
        });
        setPlayerColdStatus(pIndex, '❄️ 迷失方向');
        coldPenaltyCount[pIndex] = 1;

    } else if (tier === 1) {
        // === Tier 2: 你被雪怪赶跑了 — teleport to spawn (1,1) ===
        Sound.play('cold', 1);
        console.log('[Cold] ' + p.name + ' Tier2 雪怪赶跑 — teleported to spawn (1,1)');
        p.row = 1;
        p.col = 1;

        lostNotifications.push({
            pIndex: pIndex,
            timestamp: Date.now(),
            duration: lostNotifyDuration,
            tier: 1
        });
        setPlayerColdStatus(pIndex, '👹 被雪怪赶跑');
        coldPenaltyCount[pIndex] = 2;

    } else {
        // === Tier 3: 冻死 — both players die, reset entire map ===
        Sound.play('cold', 2);
        console.log('[Cold] ' + p.name + ' Tier3 冻死 — resetting maze');
        coldDeathPending = true;  // Freeze cold progress during death animation

        // Clear all old notifications so only the death message shows
        lostNotifications = [];
        for (var ci = 0; ci < 2; ci++) {
            if (coldStatusTimers[ci]) { clearTimeout(coldStatusTimers[ci]); coldStatusTimers[ci] = null; }
        }

        // Push death notification for all active non-finished players
        // (respect twoPlayerMode: skip P2 in single-player)
        // The player who triggered death gets the standard message;
        // surviving players get a "companion died" message.
        var deadCount = 0;
        for (var pi = 0; pi < 2; pi++) {
            if (!twoPlayerMode && pi === 1) continue;  // P2 inactive in single-player
            if (!players[pi].finished) {
                var isTrigger = (pi === pIndex);
                lostNotifications.push({
                    pIndex: pi,
                    timestamp: Date.now(),
                    duration: 5000,
                    tier: 2,
                    msg: isTrigger ? '被冻死了！重置地图！'
                                   : '你的同伴死去，孤独在暴雪中侵蚀了你'
                });
                setPlayerColdStatus(pi, isTrigger ? '💀 被冻死了' : '💀 同伴已死');
                deadCount++;
            }
        }
        console.log('[Cold] Tier3: ' + deadCount + ' player(s) died');

        // Reset penalty counters
        coldPenaltyCount = [0, 0];

        // Trigger maze regeneration after the death notification fully plays out
        // (5000ms = same as the overlay duration so player sees the full message)
        setTimeout(function() {
            loadMaze();
        }, 5000);
    }
}

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

    // v4.0.2: Potions only exist when fog is enabled — no fog, no potions
    if (!fogEnabled) {
        console.log('[Maze] Fog disabled — skipping potion placement');
        return;
    }

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
    Sound.play('potion');
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

// ==================== Flame Pickups (v4.2) ====================

/**
 * Returns number of flames based on map size.
 * Larger maps get more flames. Counting roughly correlates with map area.
 */
function getFlameCount(mapSize) {
    if (mapSize <= 11) return 5;    // Easy
    if (mapSize <= 21) return 12;   // Medium
    if (mapSize <= 31) return 22;   // Hard
    if (mapSize <= 41) return 32;   // Hell
    return 44;                       // Heaven (51)
}

/**
 * Place flames evenly across the map using a grid-based approach.
 * Divide the maze into a grid of regions and place one flame per region
 * at a random valid path cell within that region.
 * Excludes start (1,1), end, and cells too close to them.
 */
function placeFlames() {
    flames = [];

    var targetCount = getFlameCount(mazeWidth);
    console.log('[Flame] Target count: ' + targetCount + ' (map size: ' + mazeWidth + ')');

    // Collect all valid path cells
    var pathCells = [];
    for (var r = 0; r < mazeHeight; r++) {
        for (var c = 0; c < mazeWidth; c++) {
            if (maze[r][c] !== 0) continue;
            // Exclude start and end
            if (r === 1 && c === 1) continue;
            if (r === endRow && c === endCol) continue;
            // Exclude cells too close to start or end (2 cells minimum)
            var dStart = Math.abs(r - 1) + Math.abs(c - 1);
            var dEnd = Math.abs(r - endRow) + Math.abs(c - endCol);
            if (dStart <= 2 || dEnd <= 2) continue;
            pathCells.push({row: r, col: c});
        }
    }

    if (pathCells.length === 0) {
        console.log('[Flame] No suitable cells');
        return;
    }

    // Grid-based even distribution: divide maze into a grid of regions.
    // Aim for roughly targetCount regions, create a square-ish grid.
    var gridCols = Math.max(1, Math.round(Math.sqrt(targetCount * (mazeWidth / mazeHeight))));
    var gridRows = Math.max(1, Math.round(targetCount / gridCols));

    // Adjust grid dimensions to fit within maze
    gridCols = Math.min(gridCols, targetCount);
    gridRows = Math.ceil(targetCount / gridCols);

    var regionW = Math.floor(mazeWidth / gridCols);
    var regionH = Math.floor(mazeHeight / gridRows);

    // Collect path cells per region
    var regions = [];
    for (var gr = 0; gr < gridRows; gr++) {
        for (var gc = 0; gc < gridCols; gc++) {
            var rStart = gr * regionH;
            var rEnd = (gr === gridRows - 1) ? mazeHeight : (gr + 1) * regionH;
            var cStart = gc * regionW;
            var cEnd = (gc === gridCols - 1) ? mazeWidth : (gc + 1) * regionW;

            var regionCells = [];
            for (var r = rStart; r < rEnd; r++) {
                for (var c = cStart; c < cEnd; c++) {
                    if (maze[r][c] === 0 &&
                        !(r === 1 && c === 1) &&
                        !(r === endRow && c === endCol)) {
                        var ds = Math.abs(r - 1) + Math.abs(c - 1);
                        var de = Math.abs(r - endRow) + Math.abs(c - endCol);
                        if (ds > 2 && de > 2) {
                            regionCells.push({row: r, col: c});
                        }
                    }
                }
            }
            if (regionCells.length > 0) {
                regions.push(regionCells);
            }
        }
    }

    // Pick one random cell from each region (up to targetCount regions)
    for (var i = regions.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = regions[i];
        regions[i] = regions[j];
        regions[j] = tmp;
    }

    for (var i = 0; i < regions.length && flames.length < targetCount; i++) {
        var cells = regions[i];
        var pick = cells[Math.floor(Math.random() * cells.length)];
        flames.push({row: pick.row, col: pick.col});
    }

    console.log('[Flame] Placed ' + flames.length + ' flames across ' + gridRows + 'x' +
                gridCols + ' grid');
}

/**
 * Collect a flame: reduce the player's cold progress bar.
 * @param {number} pIndex - Player index (0 or 1)
 * @param {number} flameIdx - Index of the flame in the flames array
 */
function collectFlame(pIndex, flameIdx) {
    Sound.play('flame');
    var heatAmount = 6000;  // Reduce cold bar by 6000ms (~33% of a full bar)
    coldProgress[pIndex] = Math.max(0, coldProgress[pIndex] - heatAmount);
    var p = players[pIndex];
    flames.splice(flameIdx, 1);
    console.log('[Flame] ' + p.name + ' collected a flame! Cold reduced. (' + flames.length + ' remaining)');
    statusEl.textContent = '🔥 ' + p.name + ' collected a flame! Cold reduced!';
    renderMaze();
}

function startPotionAnimation() {
    if (potionPulseAnim) clearInterval(potionPulseAnim);
    potionPulseAnim = setInterval(function() {
        updateVisionIndicator();
        // Re-render if pickups exist (for pulse/flicker animations) or vision is active
        if (potions.length > 0 || flames.length > 0 || Date.now() < fullVisionUntil) {
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
    Sound.play('monster');
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

/**
 * Lighten a hex color string by a given ratio.
 * @param {string} hex - Hex color like '#4ecca3'
 * @param {number} ratio - 0 to 1, how much to lighten
 * @returns {string} Lightened rgb/rgba color
 */
function lightenColor(hex, ratio) {
    if (hex[0] === '#') {
        var r = parseInt(hex.substr(1, 2), 16);
        var g = parseInt(hex.substr(3, 2), 16);
        var b = parseInt(hex.substr(5, 2), 16);
    } else {
        // Assume rgb/rgba format — extract numbers
        var match = hex.match(/[\d.]+/g);
        if (!match || match.length < 3) return hex;
        var r = parseInt(match[0]), g = parseInt(match[1]), b = parseInt(match[2]);
    }
    r = Math.min(255, Math.floor(r + (255 - r) * ratio));
    g = Math.min(255, Math.floor(g + (255 - g) * ratio));
    b = Math.min(255, Math.floor(b + (255 - b) * ratio));
    return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

function renderMaze() {
    var canvasSize = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.78);
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    cellSize = Math.floor(canvasSize / Math.max(mazeWidth, mazeHeight));
    offsetX = Math.floor((canvasSize - mazeWidth * cellSize) / 2);
    offsetY = Math.floor((canvasSize - mazeHeight * cellSize) / 2);

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // Draw canvas background radial gradient (dark center glow)
    var bgGrad = ctx.createRadialGradient(canvasSize / 2, canvasSize / 2, canvasSize * 0.05,
                                           canvasSize / 2, canvasSize / 2, canvasSize * 0.72);
    bgGrad.addColorStop(0, '#1a1a3a');
    bgGrad.addColorStop(0.5, '#12122a');
    bgGrad.addColorStop(1, '#080818');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Draw grid cells with enhanced color palette
    for (var row = 0; row < mazeHeight; row++) {
        for (var col = 0; col < mazeWidth; col++) {
            var x = offsetX + col * cellSize;
            var y = offsetY + row * cellSize;
            if (maze[row][col] === 1) {
                // Wall: deep blue-purple with subtle top-left highlight
                ctx.fillStyle = '#3a3a5a';
                ctx.fillRect(x, y, cellSize, cellSize);
                // Subtle 3D bevel: lighter top-left edge
                if (cellSize >= 6) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                    ctx.fillRect(x, y, cellSize, 1);
                    ctx.fillRect(x, y, 1, cellSize);
                    // Darker bottom-right edge
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
                    ctx.fillRect(x, y + cellSize - 1, cellSize, 1);
                    ctx.fillRect(x + cellSize - 1, y, 1, cellSize);
                }
            } else {
                // Path: warm cream tone with subtle variation
                var pathVariation = ((row * 7 + col * 13) % 10) / 100;  // subtle per-cell variation
                var r = Math.floor(232 + pathVariation * 8);
                var g = Math.floor(224 + pathVariation * 6);
                var b = Math.floor(208 + pathVariation * 5);
                ctx.fillStyle = 'rgb(' + r + ', ' + g + ', ' + b + ')';
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        }
    }

    // Draw subtle grid lines for depth
    if (cellSize >= 6) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 0.5;
        for (var row = 0; row <= mazeHeight; row++) {
            var gy = offsetY + row * cellSize;
            ctx.beginPath();
            ctx.moveTo(offsetX, gy);
            ctx.lineTo(offsetX + mazeWidth * cellSize, gy);
            ctx.stroke();
        }
        for (var col = 0; col <= mazeWidth; col++) {
            var gx = offsetX + col * cellSize;
            ctx.beginPath();
            ctx.moveTo(gx, offsetY);
            ctx.lineTo(gx, offsetY + mazeHeight * cellSize);
            ctx.stroke();
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
                    // Full fog — completely hidden, fully opaque with subtle bluish tint
                    var x = offsetX + col * cellSize;
                    var y = offsetY + row * cellSize;
                    ctx.fillStyle = '#080820';
                    ctx.fillRect(x, y, cellSize, cellSize);
                } else if (minDist === fogRadius) {
                    // Edge fade — heavy mist, barely visible
                    var x = offsetX + col * cellSize;
                    var y = offsetY + row * cellSize;
                    ctx.fillStyle = 'rgba(8, 8, 28, 0.68)';
                    ctx.fillRect(x, y, cellSize, cellSize);
                } else if (minDist === fogRadius - 1 && fogRadius > 1) {
                    // Soft edge — light mist for smoother transition
                    var x = offsetX + col * cellSize;
                    var y = offsetY + row * cellSize;
                    ctx.fillStyle = 'rgba(10, 10, 30, 0.18)';
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
        var eCenterX = ex + cellSize / 2;
        var eCenterY = ey + cellSize / 2;

        // Radial glow under end point
        var endPulse = Math.sin(Date.now() / 500) * 0.3 + 0.7;
        var endGlow = ctx.createRadialGradient(eCenterX, eCenterY, cellSize * 0.25,
                                                eCenterX, eCenterY, cellSize * 1.6);
        endGlow.addColorStop(0, 'rgba(233, 196, 106, ' + (0.7 * endPulse) + ')');
        endGlow.addColorStop(0.5, 'rgba(233, 196, 106, ' + (0.25 * endPulse) + ')');
        endGlow.addColorStop(1, 'rgba(233, 196, 106, 0)');
        ctx.fillStyle = endGlow;
        ctx.fillRect(ex - cellSize * 0.6, ey - cellSize * 0.6, cellSize * 2.2, cellSize * 2.2);

        // Gold exit square with inner gradient
        var innerGrad = ctx.createLinearGradient(ex, ey, ex + cellSize, ey + cellSize);
        innerGrad.addColorStop(0, '#f5d88a');
        innerGrad.addColorStop(0.4, '#e9c46a');
        innerGrad.addColorStop(1, '#c9a040');
        ctx.fillStyle = innerGrad;
        ctx.fillRect(ex + 2, ey + 2, cellSize - 4, cellSize - 4);

        // Inner highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillRect(ex + 3, ey + 3, cellSize - 6, Math.floor((cellSize - 6) * 0.35));

        // Gold sparkle border
        ctx.strokeStyle = 'rgba(255, 215, 0, ' + (0.5 * endPulse) + ')';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ex + 2, ey + 2, cellSize - 4, cellSize - 4);
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

    // ---- Draw flames (v4.2) ----
    for (var fi = 0; fi < flames.length; fi++) {
        var fl = flames[fi];
        var flameVisible = !fogEnabled || hasFullVision;
        if (!flameVisible) {
            var fd1 = Math.max(Math.abs(fl.row - players[0].row), Math.abs(fl.col - players[0].col));
            if (twoPlayerMode) {
                var fd2 = Math.max(Math.abs(fl.row - players[1].row), Math.abs(fl.col - players[1].col));
                flameVisible = Math.min(fd1, fd2) <= fogRadius;
            } else {
                flameVisible = fd1 <= fogRadius;
            }
        }
        if (flameVisible) {
            drawFlame(fl);
        }
    }

    // Draw players (always visible)
    drawPlayer(players[0]);
    if (twoPlayerMode) {
        drawPlayer(players[1]);
    }

    // Draw extreme cold bars (v4.0) — overlay on top of everything
    drawColdBars();

    // Draw lost-direction overlay (v4.0.1) — topmost, most prominent
    drawLostDirectionOverlay();
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

function drawFlame(f) {
    var fx = offsetX + f.col * cellSize + cellSize / 2;
    var fy = offsetY + f.row * cellSize + cellSize / 2;
    var size = cellSize * 0.36;

    // Flicker effect
    var flicker = Math.sin(Date.now() / 120 + f.row * 3 + f.col * 7) * 0.12 +
                  Math.sin(Date.now() / 200 + f.row * 5) * 0.08 + 1;

    // Outer glow
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur = size * flicker * 2.5;

    // Flame body — 3-layer teardrop shape
    // Outer flame (red)
    ctx.fillStyle = '#e04020';
    ctx.beginPath();
    ctx.moveTo(fx, fy - size * flicker);              // top tip
    ctx.quadraticCurveTo(fx + size * 0.55, fy - size * 0.2, fx + size * 0.5, fy + size * 0.5);  // right curve
    ctx.quadraticCurveTo(fx, fy + size * 0.8, fx, fy + size * 0.5); // bottom curve
    ctx.quadraticCurveTo(fx - size * 0.5, fy + size * 0.5, fx - size * 0.55, fy - size * 0.2);  // left curve
    ctx.closePath();
    ctx.fill();

    // Middle flame (orange)
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    var midSize = size * 0.7;
    ctx.moveTo(fx, fy - midSize * flicker);
    ctx.quadraticCurveTo(fx + midSize * 0.45, fy - midSize * 0.1, fx + midSize * 0.4, fy + midSize * 0.35);
    ctx.quadraticCurveTo(fx, fy + midSize * 0.55, fx, fy + midSize * 0.4);
    ctx.quadraticCurveTo(fx - midSize * 0.4, fy + midSize * 0.35, fx - midSize * 0.45, fy - midSize * 0.1);
    ctx.closePath();
    ctx.fill();

    // Inner flame (yellow)
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    var inSize = size * 0.35;
    ctx.moveTo(fx, fy - inSize * flicker);
    ctx.quadraticCurveTo(fx + inSize * 0.4, fy - inSize * 0.05, fx + inSize * 0.3, fy + inSize * 0.2);
    ctx.quadraticCurveTo(fx, fy + inSize * 0.3, fx, fy + inSize * 0.25);
    ctx.quadraticCurveTo(fx - inSize * 0.3, fy + inSize * 0.2, fx - inSize * 0.4, fy - inSize * 0.05);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Spark embers
    var sparkCount = 3;
    for (var s = 0; s < sparkCount; s++) {
        var sx = fx + Math.sin(Date.now() / 300 + s * 2.1 + f.row) * size * 0.4;
        var sy = fy - size * 0.3 - Math.abs(Math.sin(Date.now() / 250 + s * 1.7 + f.col)) * size * 0.8;
        ctx.fillStyle = 'rgba(255, 200, 50, 0.7)';
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1, size * 0.06), 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawPlayer(p) {
    var px = offsetX + p.col * cellSize + cellSize / 2;
    var py = offsetY + p.row * cellSize + cellSize / 2;
    var pr = Math.max(4, cellSize * 0.35);

    // Radial glow under player
    var glowColor = lightenColor(p.color, 0.3);
    // Convert to rgba for glow
    var glowRgba = glowColor.replace('rgb(', 'rgba(').replace(')', ', 0.45)');
    var glowRgbaMid = glowColor.replace('rgb(', 'rgba(').replace(')', ', 0.12)');
    var glowGrad = ctx.createRadialGradient(px, py, pr * 0.3, px, py, pr * 2.2);
    glowGrad.addColorStop(0, glowRgba);
    glowGrad.addColorStop(0.5, glowRgbaMid);
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(px, py, pr * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Body with subtle gradient
    var bodyGrad = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
    bodyGrad.addColorStop(0, lightenColor(p.color, 0.25));
    bodyGrad.addColorStop(1, p.color);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
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

    // Radial glow under monster
    var monGlow = ctx.createRadialGradient(mx, my, size * 0.2, mx, my, size * 2.5);
    monGlow.addColorStop(0, 'rgba(233, 69, 96, 0.3)');
    monGlow.addColorStop(0.5, 'rgba(233, 69, 96, 0.08)');
    monGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = monGlow;
    ctx.beginPath();
    ctx.arc(mx, my, size * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Glow effect
    ctx.shadowColor = m.glowColor;
    ctx.shadowBlur = size * 2.5;

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

// ==================== Cold Bar Rendering ====================

/**
 * Draw the extreme cold progress bar(s) on the canvas.
 * P1 bar is drawn at the bottom-left; P2 bar at the bottom-right.
 * Each bar fills from left to right with an icy blue gradient.
 * When nearly full (>70%), the bar pulses red as a danger warning.
 */
function drawColdBars() {
    if (!coldModeEnabled) return;

    var barWidth = Math.floor(canvas.width * 0.42);
    var barHeight = Math.max(18, Math.floor(cellSize * 0.85));
    var marginBottom = 6;
    var marginSide = 8;

    // Determine which players to draw bars for
    var activeIndices = [];
    if (twoPlayerMode) {
        activeIndices = [0, 1];
    } else {
        activeIndices = [0];
    }

    for (var idx = 0; idx < activeIndices.length; idx++) {
        var i = activeIndices[idx];
        var p = players[i];
        if (p.finished) continue;

        var progress = Math.min(1, coldProgress[i] / coldMaxProgress);

        // Position: P1 bottom-left, P2 bottom-right
        var barX, barY;
        if (activeIndices.length === 1) {
            // Single bar: centered at bottom
            barX = Math.floor((canvas.width - barWidth) / 2);
        } else {
            barX = (i === 0) ? marginSide : canvas.width - barWidth - marginSide;
        }
        barY = canvas.height - barHeight - marginBottom;

        // === Background (dark frosted glass) ===
        ctx.fillStyle = 'rgba(10, 15, 30, 0.85)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // === Border ===
        ctx.strokeStyle = '#3a7a9a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // === Frosted border glow ===
        ctx.strokeStyle = 'rgba(120, 200, 240, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX + 1, barY + 1, barWidth - 2, barHeight - 2);

        // === Progress fill (icy gradient) ===
        if (progress > 0.005) {
            var fillWidth = Math.max(0, Math.floor((barWidth - 2) * progress));
            if (fillWidth > 0) {
                var grad = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
                grad.addColorStop(0, '#a8e6f8');
                grad.addColorStop(0.35, '#5cb8d8');
                grad.addColorStop(0.65, '#2a8ab8');
                grad.addColorStop(1, '#1a5a88');
                ctx.fillStyle = grad;
                ctx.fillRect(barX + 1, barY + 1, fillWidth, barHeight - 2);

                // Frost shimmer on top half of the fill
                ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.fillRect(barX + 1, barY + 1, fillWidth, Math.floor((barHeight - 2) * 0.4));

                // Snowflake particle effect along the leading edge
                var edgeX = barX + 1 + fillWidth;
                if (edgeX < barX + barWidth - 1 && progress > 0.05) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                    ctx.beginPath();
                    ctx.arc(edgeX, barY + barHeight / 2 - 2, 2.5, 0, Math.PI * 2);
                    ctx.arc(edgeX - 4, barY + barHeight / 2 + 2, 1.8, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // === Danger pulse when bar is >70% full ===
        if (progress > 0.7) {
            var pulse = Math.sin(Date.now() / 180) * 0.35 + 0.4;
            ctx.fillStyle = 'rgba(255, 40, 60, ' + pulse + ')';
            ctx.fillRect(barX + 1, barY + 1, barWidth - 2, barHeight - 2);

            // Danger border flash
            if (progress > 0.85) {
                var flashPulse = Math.sin(Date.now() / 120) * 0.5 + 0.5;
                ctx.strokeStyle = 'rgba(255, 50, 50, ' + flashPulse + ')';
                ctx.lineWidth = 2.5;
                ctx.strokeRect(barX, barY, barWidth, barHeight);
            }
        }

        // === Label ===
        var labelFontSize = Math.max(10, Math.floor(barHeight * 0.55));
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + labelFontSize + 'px "Microsoft YaHei", "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var label = '❄️ ' + p.label + ' 极寒 ' + Math.floor(progress * 100) + '%';
        ctx.fillText(label, barX + barWidth / 2, barY + barHeight / 2);

        // Draw snowflake icon on the left side of the bar
        var iconSize = Math.max(7, barHeight * 0.5);
        ctx.fillStyle = '#d0f0ff';
        ctx.font = iconSize + 'px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('❄️', barX + 6, barY + barHeight / 2);
    }
}

// ==================== Lost Direction Overlay (v4.1) ====================

/**
 * Tier-specific overlay config.
 * Each tier has a title, per-player message, and border colors.
 */
var TIER_OVERLAY = {
    0: { title: '🌨️ 暴风雪来袭！', msg: '在暴风雪中迷失方向！', msgColor: 'rgba(255, 220, 160, X)', borderIcy: true,  danger: 0.7 },
    1: { title: '👹 雪怪出现了！',     msg: '被雪怪赶跑了！回到起点！', msgColor: 'rgba(255, 160, 100, X)', borderIcy: false, danger: 0.9 },
    2: { title: '💀 严寒致死！',       msg: '被冻死了！重置地图！',   msgColor: 'rgba(255, 80, 60, X)',   borderIcy: false, danger: 1.0 }
};

/**
 * Draw the prominent cold penalty overlay on the canvas.
 * v4.1: Tier-aware — shows different title, message, and colors per penalty tier.
 * This is called from renderMaze() when there are active notifications.
 */
function drawLostDirectionOverlay() {
    if (lostNotifications.length === 0) return;

    var now = Date.now();

    // Find the most recent notification and its tier, also collect active players with their tier
    var newestTime = 0;
    var maxTier = 0;  // Highest-severity tier among active notifications
    var playerTiers = {};   // {pIndex: tier}
    var playerMsgs = {};    // {pIndex: customMsg} — per-player custom message override
    var activePlayers = [];
    for (var n = 0; n < lostNotifications.length; n++) {
        var notif = lostNotifications[n];
        var elapsed = now - notif.timestamp;
        if (elapsed < notif.duration) {
            var pIdx = notif.pIndex;
            // Skip P2 in single-player mode
            if (!twoPlayerMode && pIdx === 1) continue;
            var t = notif.tier || 0;
            if (activePlayers.indexOf(pIdx) === -1) {
                activePlayers.push(pIdx);
            }
            // Keep the most recent tier and custom message for each player
            playerTiers[pIdx] = t;
            if (notif.msg) { playerMsgs[pIdx] = notif.msg; }
            if (t > maxTier) maxTier = t;
            if (notif.timestamp > newestTime) {
                newestTime = notif.timestamp;
            }
        }
    }

    if (activePlayers.length === 0) return;

    // Tier config (clamp maxTier to [0, 2])
    var tierConfig = TIER_OVERLAY[Math.min(maxTier, 2)];

    // Calculate fade-in (0→1 over first 400ms)
    var newestElapsed = now - newestTime;
    var overallAlpha = Math.min(1, newestElapsed / 400);

    // Shake effect for tier 2 (death)
    var shakeX = 0, shakeY = 0;
    if (maxTier >= 2) {
        shakeX = Math.sin(now / 60) * 3 * overallAlpha;
        shakeY = Math.cos(now / 73) * 2 * overallAlpha;
    }

    // Panel dimensions — larger for higher tiers (more impactful message)
    var panelW = Math.floor(canvas.width * 0.80);
    var panelH = Math.floor(canvas.height * (maxTier >= 2 ? 0.30 : 0.26));
    var panelX = Math.floor((canvas.width - panelW) / 2) + shakeX;
    var panelY = Math.floor(canvas.height * 0.15) + shakeY;

    // === Snowflake particles (tier 0/1: snow, tier 2: ash/embers) ===
    var numFlakes = maxTier >= 2 ? 50 : 40;
    for (var f = 0; f < numFlakes; f++) {
        var fx = ((f * 137 + now * 0.02) % (canvas.width + 60)) - 30;
        var fy = ((f * 89 + now * 0.025) % (canvas.height + 60)) - 30;
        var flakeSize = 2.5 + (f % 5) * 1.8;
        var flakeAlpha = (0.25 + Math.sin(now / 600 + f * 1.7) * 0.2) * overallAlpha;
        if (maxTier >= 2) {
            // Ember particles for death tier
            drawSnowflake(fx, fy, flakeSize * 0.6, flakeAlpha * 0.7, now + f * 100);
        } else {
            drawSnowflake(fx, fy, flakeSize, flakeAlpha, now + f * 100);
        }
    }

    // === Main panel background (frosted dark glass, redder for higher tiers) ===
    var bgR = 5, bgG = 12, bgB = 30;
    if (maxTier >= 2) { bgR = 25; bgG = 8; bgB = 12; }
    else if (maxTier >= 1) { bgR = 15; bgG = 10; bgB = 20; }
    ctx.fillStyle = 'rgba(' + bgR + ', ' + bgG + ', ' + bgB + ', ' + (0.92 * overallAlpha) + ')';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    // === Outer border — tier-specific color ===
    var borderPulse = Math.sin(now / 250) * 0.3 + 0.7;
    var borderColor;
    if (maxTier >= 2) {
        borderColor = 'rgba(255, 40, 40, ' + (borderPulse * overallAlpha) + ')';
    } else if (maxTier >= 1) {
        borderColor = 'rgba(255, 140, 60, ' + (borderPulse * overallAlpha) + ')';
    } else {
        borderColor = 'rgba(100, 200, 240, ' + (borderPulse * overallAlpha) + ')';
    }
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    // === Inner danger border ===
    var dangerPulse = Math.sin(now / 200) * 0.4 + 0.6;
    var innerDanger = tierConfig.danger;
    ctx.strokeStyle = 'rgba(255, ' + Math.floor(60 * (1 - innerDanger) + 40) + ', ' + Math.floor(80 * (1 - innerDanger) + 20) + ', ' + (innerDanger * 0.8 * overallAlpha) + ')';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(panelX + 4, panelY + 4, panelW - 8, panelH - 8);

    // === Top accent line (icy glow for tier 0, fire glow for tier 1-2) ===
    var accentGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
    var accentColor;
    if (maxTier >= 2) {
        accentColor = 'rgba(255, 80, 40';
    } else if (maxTier >= 1) {
        accentColor = 'rgba(255, 160, 60';
    } else {
        accentColor = 'rgba(120, 200, 240';
    }
    accentGrad.addColorStop(0, accentColor + ', 0)');
    accentGrad.addColorStop(0.2, accentColor + ', ' + (0.8 * overallAlpha) + ')');
    accentGrad.addColorStop(0.8, accentColor + ', ' + (0.8 * overallAlpha) + ')');
    accentGrad.addColorStop(1, accentColor + ', 0)');
    ctx.strokeStyle = accentGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(panelX + 10, panelY + 2);
    ctx.lineTo(panelX + panelW - 10, panelY + 2);
    ctx.stroke();

    // === Title — tier-specific ===
    var titleFontSize = Math.max(18, Math.floor(panelH * 0.2));
    var titleColor;
    if (maxTier >= 2) {
        titleColor = 'rgba(255, 180, 150';
    } else if (maxTier >= 1) {
        titleColor = 'rgba(255, 200, 150';
    } else {
        titleColor = 'rgba(180, 220, 255';
    }
    ctx.fillStyle = titleColor + ', ' + overallAlpha + ')';
    ctx.font = 'bold ' + titleFontSize + 'px "Microsoft YaHei", "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var titleY = panelY + Math.floor(panelH * 0.07);
    ctx.fillText(tierConfig.title, panelX + panelW / 2, titleY);

    // === Separator line ===
    var sepY = titleY + titleFontSize + Math.floor(panelH * 0.04);
    var sepW = Math.floor(panelW * 0.45);
    ctx.strokeStyle = 'rgba(' + (maxTier >= 1 ? '255, 150, 120' : '120, 180, 220') + ', ' + (0.5 * overallAlpha) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + (panelW - sepW) / 2, sepY);
    ctx.lineTo(panelX + (panelW + sepW) / 2, sepY);
    ctx.stroke();

    // === Player lines — each player shows their own tier's message ===
    var bodyFontSize = Math.max(15, Math.floor(panelH * 0.17));
    var lineSpacing = bodyFontSize + Math.floor(panelH * 0.08);
    var bodyY = sepY + Math.floor(panelH * 0.08);

    for (var a = 0; a < activePlayers.length; a++) {
        var pi = activePlayers[a];
        var pp = players[pi];
        var pt = playerTiers[pi] || 0;
        var ptConfig = TIER_OVERLAY[Math.min(pt, 2)];
        var playerMsg = playerMsgs[pi] || ptConfig.msg;
        var playerLineY = bodyY + a * lineSpacing + bodyFontSize / 2;

        // Measure text widths for centering
        ctx.font = 'bold ' + bodyFontSize + 'px "Microsoft YaHei", "Segoe UI", Arial, sans-serif';
        var nameWidth = ctx.measureText(pp.name).width;
        var spaceWidth = ctx.measureText(' ').width;

        ctx.font = bodyFontSize + 'px "Microsoft YaHei", "Segoe UI", Arial, sans-serif';
        var msgWidth = ctx.measureText(playerMsg).width;

        var dotRadius = Math.max(6, bodyFontSize * 0.35);
        var dotGap = bodyFontSize * 0.5;
        var totalWidth = dotRadius * 2 + dotGap + nameWidth + spaceWidth + msgWidth;
        var lineStartX = panelX + (panelW - totalWidth) / 2;

        // Colored dot (pulse for tier 2)
        var dotX = lineStartX + dotRadius;
        ctx.fillStyle = pp.color;
        ctx.beginPath();
        ctx.arc(dotX, playerLineY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (pt >= 2) {
            // Skull dot for death
            ctx.fillStyle = '#fff';
            ctx.font = 'bold ' + Math.max(8, dotRadius) + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('☠', dotX, playerLineY);
        }

        // Player name (colored, bold)
        var nameX = dotX + dotRadius + dotGap;
        ctx.fillStyle = pp.color;
        ctx.font = 'bold ' + bodyFontSize + 'px "Microsoft YaHei", "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(pp.name, nameX, playerLineY);

        // Tier-specific message
        var lostX = nameX + nameWidth + spaceWidth;
        var msgC = ptConfig.msgColor.replace('X', overallAlpha);
        ctx.fillStyle = msgC;
        ctx.font = bodyFontSize + 'px "Microsoft YaHei", "Segoe UI", Arial, sans-serif';
        ctx.fillText(playerMsg, lostX, playerLineY);
    }

    // === Bottom emphasis line (if both players affected) ===
    if (activePlayers.length >= 2) {
        var emY = bodyY + activePlayers.length * lineSpacing + Math.floor(panelH * 0.03);
        var emFontSize = Math.max(12, Math.floor(panelH * 0.13));
        var emphasisMsg;
        if (maxTier >= 2) {
            // Check if one player survived (has custom companion-died message)
            var hasSurvivor = false;
            for (var a2 = 0; a2 < activePlayers.length; a2++) {
                var idx2 = activePlayers[a2];
                var m = playerMsgs[idx2];
                if (m && m.indexOf('同伴') !== -1) { hasSurvivor = true; break; }
            }
            emphasisMsg = hasSurvivor
                ? '💀 严寒夺走了一位玩家，幸存者在孤独中挣扎！'
                : '💀 两位玩家都陷入了致命严寒！';
        } else if (maxTier >= 1) {
            emphasisMsg = '👹 两位玩家都遭遇了雪怪！';
        } else {
            emphasisMsg = '⚠️ 两位玩家都在暴风雪中迷失了！';
        }
        ctx.fillStyle = 'rgba(255, ' + (maxTier >= 1 ? '100' : '150') + ', ' + (maxTier >= 1 ? '60' : '100') + ', ' + (dangerPulse * overallAlpha) + ')';
        ctx.font = 'italic ' + emFontSize + 'px "Microsoft YaHei", "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(emphasisMsg, panelX + panelW / 2, emY);
    }

    // === Bottom snow drift / ember line ===
    var driftY = panelY + panelH - 3;
    ctx.strokeStyle = maxTier >= 2
        ? 'rgba(255, 100, 40, ' + (0.5 * overallAlpha) + ')'
        : 'rgba(180, 220, 255, ' + (0.5 * overallAlpha) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(panelX + 20, driftY);
    for (var dx = 0; dx <= panelW - 40; dx += 8) {
        var dy = Math.sin(now / 400 + dx / 30) * 2;
        ctx.lineTo(panelX + 20 + dx, driftY + dy);
    }
    ctx.stroke();

    // Reset text alignment
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}

/**
 * Draw a single beautiful snowflake (❄ 6-pointed star shape) at the given position.
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Base radius
 * @param {number} alpha - Opacity
 * @param {number} seed - Deterministic rotation seed
 */
function drawSnowflake(x, y, size, alpha, seed) {
    ctx.save();
    ctx.globalAlpha = alpha;

    var arms = 6;
    var angleStep = (Math.PI * 2) / arms;
    var rotation = (seed * 0.01745) % (Math.PI * 2); // convert seed to radians

    // === Outer glow ===
    ctx.fillStyle = 'rgba(200, 230, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(x, y, size * 1.6, 0, Math.PI * 2);
    ctx.fill();

    for (var a = 0; a < arms; a++) {
        var angle = rotation + a * angleStep;

        // Main arm
        var tipX = x + Math.cos(angle) * size;
        var tipY = y + Math.sin(angle) * size;

        // Side branch positions
        var branch1Ratio = 0.45;
        var branch2Ratio = 0.7;

        var b1x = x + Math.cos(angle) * size * branch1Ratio;
        var b1y = y + Math.sin(angle) * size * branch1Ratio;
        var b2x = x + Math.cos(angle) * size * branch2Ratio;
        var b2y = y + Math.sin(angle) * size * branch2Ratio;

        var branchLen = size * 0.25;

        // Draw main arm (thick line from center to tip)
        ctx.strokeStyle = 'rgba(220, 240, 255, 0.9)';
        ctx.lineWidth = Math.max(1, size * 0.2);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // Side branch at 45%
        var perpAngle1 = angle + Math.PI / 2;
        var sb1x1 = b1x + Math.cos(perpAngle1) * branchLen;
        var sb1y1 = b1y + Math.sin(perpAngle1) * branchLen;
        var sb1x2 = b1x - Math.cos(perpAngle1) * branchLen;
        var sb1y2 = b1y - Math.sin(perpAngle1) * branchLen;

        ctx.strokeStyle = 'rgba(220, 240, 255, 0.7)';
        ctx.lineWidth = Math.max(0.8, size * 0.13);
        ctx.beginPath();
        ctx.moveTo(sb1x1, sb1y1);
        ctx.lineTo(sb1x2, sb1y2);
        ctx.stroke();

        // Side branch at 70%
        var perpAngle2 = angle + Math.PI / 2.2;
        var sb2x1 = b2x + Math.cos(perpAngle2) * branchLen * 0.7;
        var sb2y1 = b2y + Math.sin(perpAngle2) * branchLen * 0.7;
        var sb2x2 = b2x - Math.cos(perpAngle2) * branchLen * 0.7;
        var sb2y2 = b2y - Math.sin(perpAngle2) * branchLen * 0.7;

        ctx.strokeStyle = 'rgba(220, 240, 255, 0.5)';
        ctx.lineWidth = Math.max(0.6, size * 0.1);
        ctx.beginPath();
        ctx.moveTo(sb2x1, sb2y1);
        ctx.lineTo(sb2x2, sb2y2);
        ctx.stroke();

        // Tiny tip sparkle
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(tipX, tipY, Math.max(0.8, size * 0.15), 0, Math.PI * 2);
        ctx.fill();
    }

    // Center dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, size * 0.22), 0, Math.PI * 2);
    ctx.fill();

    // Inner glow
    ctx.fillStyle = 'rgba(200, 230, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
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
    if (p.finished) return;
    Sound.play('move'); // Already done

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

    // Check flame collection (v4.2)
    for (var fi = 0; fi < flames.length; fi++) {
        if (p.row === flames[fi].row && p.col === flames[fi].col) {
            collectFlame(pIndex, fi);
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
            Sound.play('victory');
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
        Sound.play('victory');
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

    // Place pickups
    placePotions();
    // Flames only generate when cold mode is active
    if (coldModeEnabled) {
        placeFlames();
    } else {
        flames = [];
    }

    // Generate monsters on three-way intersections (only if enabled)
    stopMonsterMovement();
    monsters = [];
    if (monstersEnabled) {
        generateMonsters();
        startMonsterMovement();
    }

    // Apply mode UI
    updateModeUI();

    // Restart cold mode if enabled (v4.0)
    if (coldModeEnabled) {
        startColdMode();
    }
}

function loadMaze() {
    if (isLoading) { console.log('[Maze] Already loading, skip'); return; }
    isLoading = true;

    var size = parseInt(levelSelect.value);

    // Step 1: Generate local maze immediately
    Sound.play('generate');
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
        // v4.0.2: Turning fog ON regenerates potions
        placePotions();
        statusEl.textContent = '🌫 Fog enabled — potions appear!';
    } else {
        // Disabling fog also cancels any active potion full vision and clears all potions
        fullVisionUntil = 0;
        potions = [];
        updateVisionIndicator();
        fogToggleBtn.textContent = '☀ 开启迷雾';
        fogToggleBtn.classList.add('fog-off');
        statusEl.textContent = '☀ Fog disabled — potions removed!';
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

coldToggleBtn.addEventListener('click', function() {
    coldModeEnabled = !coldModeEnabled;
    if (coldModeEnabled) {
        coldToggleBtn.textContent = '❄️ 关闭极寒';
        coldToggleBtn.classList.add('cold-on');
        placeFlames();
        startColdMode();
        statusEl.textContent = '❄️ 极寒模式已开启！🔥 火苗已生成';
    } else {
        coldToggleBtn.textContent = '❄️ 极寒模式';
        coldToggleBtn.classList.remove('cold-on');
        stopColdMode();
        flames = [];
        statusEl.textContent = 'Go!';
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
    // Restart cold mode if enabled (v4.0)
    if (coldModeEnabled) {
        startColdMode();
    }
    statusEl.textContent = 'Go!';
    renderMaze();
});

// ==================== Start ====================
loadMaze();
