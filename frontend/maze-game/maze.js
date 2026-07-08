/* ========================================
   Maze Game - Two-Player Mode (Player A)
   Data structure: 2D array/matrix for maze grid
   0 = path, 1 = wall

   Player 1 = Green  (WASD keys)
   Player 2 = Blue   (Arrow keys)

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

// Full Map Vision Potion state
var potion = { row: -1, col: -1, active: false };
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

function placePotion() {
    // Cancel any active effect
    potion.active = false;
    fullVisionUntil = 0;

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

    if (pathCells.length > 0) {
        var cell = pathCells[Math.floor(Math.random() * pathCells.length)];
        potion.row = cell.row;
        potion.col = cell.col;
        potion.active = true;
        console.log('[Maze] Potion placed at (' + potion.row + ', ' + potion.col + ')');
    } else {
        console.log('[Maze] No suitable cell for potion');
    }
}

function collectPotion(p) {
    potion.active = false;
    fullVisionUntil = Date.now() + 3000;  // 3 seconds of full vision
    console.log('[Maze] ' + p.name + ' collected potion! Full vision for 3s');

    // Show status message
    if (!players[0].finished || !players[1].finished) {
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
        // Re-render if potion is active (for pulse animation) or vision is active (countdown)
        if (potion.active || Date.now() < fullVisionUntil) {
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
                var d2 = Math.max(Math.abs(row - players[1].row), Math.abs(col - players[1].col));
                var minDist = Math.min(d1, d2);

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
    var endDist2 = Math.max(Math.abs(endRow - players[1].row), Math.abs(endCol - players[1].col));
    var endMinDist = Math.min(endDist1, endDist2);
    if (!fogEnabled || hasFullVision || endMinDist <= fogRadius) {
        var ex = offsetX + endCol * cellSize;
        var ey = offsetY + endRow * cellSize;
        ctx.fillStyle = '#e9c46a';
        ctx.fillRect(ex + 2, ey + 2, cellSize - 4, cellSize - 4);
    }

    // ---- Draw potion ----
    if (potion.active) {
        // Potion is visible: fog is off, OR full vision is active, OR within extended range
        var potionVisible = !fogEnabled || hasFullVision;
        if (!potionVisible) {
            var pd1 = Math.max(Math.abs(potion.row - players[0].row), Math.abs(potion.col - players[0].col));
            var pd2 = Math.max(Math.abs(potion.row - players[1].row), Math.abs(potion.col - players[1].col));
            potionVisible = Math.min(pd1, pd2) <= fogRadius + 2;
        }
        if (potionVisible) {
            drawPotion();
        }
    }

    // Draw both players (always visible)
    drawPlayer(players[0]);
    drawPlayer(players[1]);
}

function drawPotion() {
    var px = offsetX + potion.col * cellSize + cellSize / 2;
    var py = offsetY + potion.row * cellSize + cellSize / 2;
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
    if (potion.active && p.row === potion.row && p.col === potion.col) {
        collectPotion(p);
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
        var levelMap = {11: 1, 21: 2, 31: 3};
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

    // Place full vision potion
    placePotion();
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

    // Check if both already finished
    if (players[0].finished && players[1].finished) return;

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

    // ---- Player 2: Arrow keys ----
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

// ==================== Start ====================
loadMaze();
