/* ========================================
   Maze Game - Player A
   Data structure: 2D array/matrix for maze grid
   0 = path, 1 = wall

   API deps:
   - GET  /api/maze/generate  (Player C, port 5001)
   - POST /api/score          (Player D, port 5002)
   ======================================== */

// ==================== DOM Elements ====================
var canvas = document.getElementById('mazeCanvas');
var ctx = canvas.getContext('2d');
var timerEl = document.getElementById('timer');
var playerNameInput = document.getElementById('playerName');
var levelSelect = document.getElementById('levelSelect');
var regenBtn = document.getElementById('regenerateBtn');

// ==================== Game State ====================
var maze = [];
var mazeWidth = 21;
var mazeHeight = 21;
var cellSize = 20;

var playerRow = 1;
var playerCol = 1;
var endRow = 1;
var endCol = 1;

var startTime = null;
var elapsedSeconds = 0;
var timerInterval = null;
var gameStarted = false;
var gameFinished = false;

var offsetX = 0;
var offsetY = 0;
var isLoading = false;

// ==================== Maze Generation (Local) ====================

function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
}

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
            } catch (e) {
                console.warn('[Maze] API parse error:', e);
            }
        }
        console.warn('[Maze] API unavailable, using local maze');
        callback(null);
    };

    xhr.onerror = function() {
        console.warn('[Maze] API network error, using local maze');
        callback(null);
    };

    xhr.ontimeout = function() {
        console.warn('[Maze] API timeout, using local maze');
        callback(null);
    };

    xhr.send();
}

function submitScore(playerName, time, level) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://localhost:5002/api/score', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onload = function() {
        if (xhr.status === 200) {
            var data = JSON.parse(xhr.responseText);
            if (data.success) {
                console.log('[Maze] Score saved, level:', level);
            } else {
                console.warn('[Maze] Score save failed:', data.message);
            }
        }
    };

    xhr.onerror = function() {
        console.warn('[Maze] Score submit network error');
    };

    xhr.send(JSON.stringify({
        player: playerName,
        time: time,
        level: level
    }));
}

// ==================== Render Engine ====================

function renderMaze() {
    cellSize = Math.floor(500 / Math.max(mazeWidth, mazeHeight));
    offsetX = Math.floor((500 - mazeWidth * cellSize) / 2);
    offsetY = Math.floor((500 - mazeHeight * cellSize) / 2);

    ctx.clearRect(0, 0, 500, 500);

    // Draw grid
    for (var row = 0; row < mazeHeight; row++) {
        for (var col = 0; col < mazeWidth; col++) {
            var x = offsetX + col * cellSize;
            var y = offsetY + row * cellSize;
            if (maze[row][col] === 1) {
                ctx.fillStyle = '#3a3a4a';
            } else {
                ctx.fillStyle = '#f0f0f0';
            }
            ctx.fillRect(x, y, cellSize, cellSize);
        }
    }

    // Draw end point (red)
    var ex = offsetX + endCol * cellSize;
    var ey = offsetY + endRow * cellSize;
    ctx.fillStyle = '#e94560';
    ctx.fillRect(ex + 2, ey + 2, cellSize - 4, cellSize - 4);

    // Draw player (green circle)
    var px = offsetX + playerCol * cellSize + cellSize / 2;
    var py = offsetY + playerRow * cellSize + cellSize / 2;
    var pr = Math.max(4, cellSize * 0.35);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = '#4ecca3';
    ctx.fill();
    ctx.strokeStyle = '#2d8a6e';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// ==================== Timer ====================

function updateTimer() {
    if (startTime !== null) {
        elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    }
    timerEl.textContent = elapsedSeconds;
}

function startTimer() {
    if (gameStarted) return;
    gameStarted = true;
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 200);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    updateTimer();
}

function resetTimer() {
    stopTimer();
    startTime = null;
    elapsedSeconds = 0;
    gameStarted = false;
    timerEl.textContent = '0';
}

// ==================== Player Movement ====================

function movePlayer(dRow, dCol) {
    if (gameFinished) return;

    var nr = playerRow + dRow;
    var nc = playerCol + dCol;

    if (nr < 0 || nr >= mazeHeight || nc < 0 || nc >= mazeWidth) return;
    if (maze[nr][nc] === 1) return;

    playerRow = nr;
    playerCol = nc;
    renderMaze();

    if (playerRow === endRow && playerCol === endCol) {
        onReachEnd();
    }
}

function onReachEnd() {
    gameFinished = true;
    stopTimer();

    var playerName = playerNameInput.value.trim() || 'Player';
    alert('Clear! Player: ' + playerName + ' Time: ' + elapsedSeconds + 's');

    var size = parseInt(levelSelect.value);
    var levelMap = {11: 1, 21: 2, 31: 3};
    var level = levelMap[size] || 1;

    submitScore(playerName, elapsedSeconds, level);
}

// ==================== Game Init & Reset ====================

function setupGame() {
    playerRow = 1;
    playerCol = 1;
    if (maze[playerRow] && maze[playerRow][playerCol] !== undefined) {
        maze[playerRow][playerCol] = 0;
    }

    endRow = mazeHeight - 2;
    endCol = mazeWidth - 2;
    if (endRow < 1) endRow = mazeHeight - 1;
    if (endCol < 1) endCol = mazeWidth - 1;
    if (maze[endRow] && maze[endRow][endCol] !== undefined) {
        maze[endRow][endCol] = 0;
    }

    gameFinished = false;
    resetTimer();
}

function loadMaze() {
    if (isLoading) {
        console.log('[Maze] Already loading, skip');
        return;
    }
    isLoading = true;

    var size = parseInt(levelSelect.value);

    // Step 1: Generate local maze immediately (always works)
    console.log('[Maze] Local generation, size:', size);
    maze = generateMaze(size, size);
    mazeWidth = size;
    mazeHeight = size;
    setupGame();
    renderMaze();

    // Step 2: Try API in background for better maze
    fetchMazeFromAPI(size, size, function(data) {
        if (data && data.maze) {
            console.log('[Maze] Replacing with API maze');
            maze = data.maze;
            mazeWidth = data.width;
            mazeHeight = data.height;
            setupGame();
            renderMaze();
        }
        // Always restore button
        regenBtn.disabled = false;
        regenBtn.textContent = 'New Maze';
        isLoading = false;
    });

    // Also set a fallback timeout in case callback never fires
    setTimeout(function() {
        if (isLoading) {
            console.log('[Maze] Fallback restore');
            regenBtn.disabled = false;
            regenBtn.textContent = 'New Maze';
            isLoading = false;
        }
    }, 6000);
}

// ==================== Event Listeners ====================

document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        return;
    }

    if (gameFinished) return;

    var dRow = 0, dCol = 0;
    switch (e.key) {
        case 'ArrowUp':    dRow = -1; break;
        case 'ArrowDown':  dRow = 1;  break;
        case 'ArrowLeft':  dCol = -1; break;
        case 'ArrowRight': dCol = 1;  break;
        default: return;
    }

    e.preventDefault();

    if (!gameStarted) {
        startTimer();
    }

    movePlayer(dRow, dCol);
});

regenBtn.addEventListener('click', function() {
    loadMaze();
});

levelSelect.addEventListener('change', function() {
    loadMaze();
});

// ==================== Start ====================
loadMaze();
