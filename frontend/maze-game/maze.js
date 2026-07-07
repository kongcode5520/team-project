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

    grid[h - 2][w - 2] = 0;
    return grid;
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

    // Draw end point (gold)
    var ex = offsetX + endCol * cellSize;
    var ey = offsetY + endRow * cellSize;
    ctx.fillStyle = '#e9c46a';
    ctx.fillRect(ex + 2, ey + 2, cellSize - 4, cellSize - 4);

    // Draw both players
    drawPlayer(players[0]);
    drawPlayer(players[1]);
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

    endRow = mazeHeight - 2;
    endCol = mazeWidth - 2;
    if (endRow < 1) endRow = mazeHeight - 1;
    if (endCol < 1) endCol = mazeWidth - 1;
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

// ==================== Start ====================
loadMaze();
