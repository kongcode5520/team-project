/* ========================================
   迷宫游戏 — 迷宫渲染 + 操控逻辑
   队员A 负责此模块

   /* 数据结构：二维数组/矩阵，存储迷宫每个格子的值 */

   依赖接口：
   - GET  /api/maze/generate  (队员C, port 5001)
   - POST /api/score          (队员D, port 5002)
   ======================================== */

// ==================== DOM 元素 ====================
const canvas = document.getElementById('mazeCanvas');
const ctx = canvas.getContext('2d');
const timerEl = document.getElementById('timer');
const playerNameInput = document.getElementById('playerName');
const levelSelect = document.getElementById('levelSelect');
const regenBtn = document.getElementById('regenerateBtn');

// ==================== 游戏状态 ====================

/* 数据结构：二维数组/矩阵，存储迷宫每个格子的值
 * maze[row][col]:
 *   0 = 路（可通行）
 *   1 = 墙（不可通行）
 */
let maze = [];

let mazeWidth = 21;   // 迷宫宽度（列数）
let mazeHeight = 21;  // 迷宫高度（行数）
let cellSize = 20;    // 每个格子的像素大小（自适应计算）

// 玩家位置（网格坐标）
let playerRow = 1;
let playerCol = 1;

// 终点位置（网格坐标）
let endRow = 1;
let endCol = 1;

// 计时器
let startTime = null;     // 首次按键的时间戳
let elapsedSeconds = 0;   // 已用秒数
let timerInterval = null; // setInterval 句柄
let gameStarted = false;  // 是否已开始
let gameFinished = false; // 是否已通关

// 画布偏移（让迷宫在画布上居中）
let offsetX = 0;
let offsetY = 0;

// ==================== API 调用 ====================

/**
 * 调用队员C 的接口：生成迷宫
 * 页面对localhost:5001提供，API也在同端口，使用相对路径
 * GET /api/maze/generate?width=21&height=21
 */
async function fetchMaze(width, height) {
    const url = `/api/maze/generate?width=${width}&height=${height}`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        // data 格式: { maze: [[...], ...], width: 21, height: 21 }
        return data;
    } catch (err) {
        console.error('获取迷宫失败：', err);
        alert('无法连接迷宫生成服务 (队员C, port 5001)，请确认后端已启动。');
        return null;
    }
}

/**
 * 调用队员D 的接口：提交成绩
 * POST http://localhost:5002/api/score
 * 请求体: { player: "玩家名", time: 35, level: 1 }
 */
async function submitScore(playerName, time, level) {
    const url = 'http://localhost:5002/api/score';
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                player: playerName,
                time: time,
                level: level
            })
        });
        const data = await res.json();
        // data 格式: { success: true, message: "成绩已保存" }
        return data;
    } catch (err) {
        console.error('提交成绩失败：', err);
        return { success: false, message: '网络错误，成绩未保存' };
    }
}

// ==================== 渲染引擎 ====================

/**
 * 绘制整个迷宫到 Canvas
 * 墙壁用深灰色，道路用白色
 * 玩家用绿色圆形，终点用红色方块
 */
function renderMaze() {
    // 计算格子大小，确保迷宫适合 500×500 的画布
    cellSize = Math.floor(500 / Math.max(mazeWidth, mazeHeight));

    // 计算偏移量使迷宫居中
    offsetX = Math.floor((500 - mazeWidth * cellSize) / 2);
    offsetY = Math.floor((500 - mazeHeight * cellSize) / 2);

    // 清空画布
    ctx.clearRect(0, 0, 500, 500);

    // 1. 绘制迷宫格子（墙壁和道路）
    for (let row = 0; row < mazeHeight; row++) {
        for (let col = 0; col < mazeWidth; col++) {
            const x = offsetX + col * cellSize;
            const y = offsetY + row * cellSize;

            if (maze[row][col] === 1) {
                // 墙壁：深灰色
                ctx.fillStyle = '#3a3a4a';
                ctx.fillRect(x, y, cellSize, cellSize);
            } else {
                // 道路：白色/浅色
                ctx.fillStyle = '#f0f0f0';
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        }
    }

    // 2. 绘制终点（红色方块，在终点格子的中心区域）
    const endX = offsetX + endCol * cellSize;
    const endY = offsetY + endRow * cellSize;
    ctx.fillStyle = '#e94560';
    ctx.fillRect(endX + 2, endY + 2, cellSize - 4, cellSize - 4);
    // 终点标记文字
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(10, cellSize * 0.5)}px 'Microsoft YaHei'`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('终', endX + cellSize / 2, endY + cellSize / 2);

    // 3. 绘制玩家（绿色圆形）
    const playerX = offsetX + playerCol * cellSize + cellSize / 2;
    const playerY = offsetY + playerRow * cellSize + cellSize / 2;
    const playerRadius = Math.max(4, cellSize * 0.35);

    ctx.beginPath();
    ctx.arc(playerX, playerY, playerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#4ecca3';
    ctx.fill();
    ctx.strokeStyle = '#2d8a6e';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// ==================== 计时器 ====================

/**
 * 更新计时器显示
 */
function updateTimer() {
    if (startTime !== null) {
        elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    }
    timerEl.textContent = elapsedSeconds;
}

/**
 * 启动计时器（首次按键时调用）
 */
function startTimer() {
    if (gameStarted) return;
    gameStarted = true;
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 200);
}

/**
 * 停止计时器（通关时调用）
 */
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    updateTimer(); // 最后一次更新确保精确
}

/**
 * 重置计时器
 */
function resetTimer() {
    stopTimer();
    startTime = null;
    elapsedSeconds = 0;
    gameStarted = false;
    timerEl.textContent = '0';
}

// ==================== 玩家移动 ====================

/**
 * 尝试将玩家移动到目标格子
 * 只能在路(0)上走，不能穿墙(1)
 */
function movePlayer(dRow, dCol) {
    if (gameFinished) return; // 已通关，禁止移动

    const newRow = playerRow + dRow;
    const newCol = playerCol + dCol;

    // 边界检查
    if (newRow < 0 || newRow >= mazeHeight || newCol < 0 || newCol >= mazeWidth) {
        return;
    }

    // 碰撞检测：不能穿墙（值为 1 的格子不可通行）
    if (maze[newRow][newCol] === 1) {
        return;
    }

    // 移动玩家
    playerRow = newRow;
    playerCol = newCol;

    // 重绘
    renderMaze();

    // 检查是否到达终点
    if (playerRow === endRow && playerCol === endCol) {
        onReachEnd();
    }
}

/**
 * 到达终点时的处理
 */
async function onReachEnd() {
    gameFinished = true;
    stopTimer();

    // 弹出通关提示
    const playerName = playerNameInput.value.trim() || '匿名玩家';
    alert(`🎉 恭喜通关！\n玩家：${playerName}\n用时：${elapsedSeconds} 秒`);

    // 提交成绩到队员D 的接口
    const result = await submitScore(playerName, elapsedSeconds, 1);
    if (result.success) {
        console.log('成绩已保存');
    } else {
        console.warn('成绩提交失败：', result.message);
    }
}

// ==================== 游戏初始化 & 重置 ====================

/**
 * 加载迷宫：调用队员C 接口获取迷宫数据
 */
async function loadMaze() {
    const size = parseInt(levelSelect.value);
    const data = await fetchMaze(size, size);

    if (!data || !data.maze) {
        // 获取失败，使用一个简单的后备迷宫
        console.warn('使用本地后备迷宫');
        maze = generateFallbackMaze(size, size);
        mazeWidth = size;
        mazeHeight = size;
    } else {
        maze = data.maze;
        mazeWidth = data.width;
        mazeHeight = data.height;
    }

    // 设置玩家起点：固定 maze[1][1]
    playerRow = 1;
    playerCol = 1;
    // 确保起点是路
    if (maze[playerRow] && maze[playerRow][playerCol] !== undefined) {
        maze[playerRow][playerCol] = 0;
    }

    // 设置终点：固定 maze[height-2][width-2]
    endRow = mazeHeight - 2;
    endCol = mazeWidth - 2;
    // 确保终点是路
    if (maze[endRow] && maze[endRow][endCol] !== undefined) {
        maze[endRow][endCol] = 0;
    }

    // 重置游戏状态
    gameFinished = false;
    resetTimer();

    // 渲染迷宫
    renderMaze();
}

/**
 * 后备迷宫生成（当后端不可用时使用）
 * 生成一个简单的迷宫供测试
 */
function generateFallbackMaze(width, height) {
    // 确保宽高为奇数
    if (width % 2 === 0) width++;
    if (height % 2 === 0) height++;

    // 初始化为全墙
    const grid = [];
    for (let r = 0; r < height; r++) {
        grid[r] = [];
        for (let c = 0; c < width; c++) {
            grid[r][c] = 1;
        }
    }

    // 简单递归分割生成通路（确保有解）
    function carve(r, c) {
        grid[r][c] = 0;
        const dirs = [[-2, 0], [0, 2], [2, 0], [0, -2]];
        // 随机打乱方向
        for (let i = dirs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }
        for (const [dr, dc] of dirs) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr > 0 && nr < height - 1 && nc > 0 && nc < width - 1 && grid[nr][nc] === 1) {
                // 打通中间墙
                grid[r + dr / 2][c + dc / 2] = 0;
                carve(nr, nc);
            }
        }
    }

    carve(1, 1);
    return grid;
}

// ==================== 事件监听 ====================

// 键盘方向键控制
document.addEventListener('keydown', (e) => {
    // 如果焦点在输入框里，不拦截（但方向键在输入框一般不会用到）
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        // 允许玩家名输入框正常打字
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            // 方向键即使在输入框也用于游戏
        } else {
            return;
        }
    }

    if (gameFinished) return; // 通关后不再响应

    let dRow = 0, dCol = 0;

    switch (e.key) {
        case 'ArrowUp':    dRow = -1; break;
        case 'ArrowDown':  dRow = 1;  break;
        case 'ArrowLeft':  dCol = -1; break;
        case 'ArrowRight': dCol = 1;  break;
        default: return; // 非方向键，不处理
    }

    e.preventDefault(); // 阻止页面滚动

    // 首次按键启动计时器
    if (!gameStarted) {
        startTimer();
    }

    movePlayer(dRow, dCol);
});

// 重新生成迷宫按钮
regenBtn.addEventListener('click', () => {
    loadMaze();
});

// 关卡切换时自动重新加载
levelSelect.addEventListener('change', () => {
    loadMaze();
});

// ==================== 启动 ====================

// 页面加载完成后自动获取迷宫
loadMaze();
