/**
 * 迷宫排行榜 — 前端逻辑
 * 队员B 负责
 *
 * 数据结构：数组，存储排行榜记录，使用比较排序按通关时间升序排列
 * 时间复杂度：O(n log n)，使用 JavaScript 内置排序
 */

// ===== 常量 =====
// 后端 API 地址（队员D 实现）
const API_BASE = 'http://localhost:5002';
const API_LEADERBOARD = `${API_BASE}/api/leaderboard`;
const API_LEVELS = `${API_BASE}/api/levels`;

// ===== 状态变量 =====
// 数据结构：数组，存储从后端获取的排行榜原始数据
let scoresData = [];
// 当前选中的关卡编号（null 表示全部关卡）
let currentLevel = null;
// 关卡列表缓存
let levelsCache = [];

// ===== DOM 元素 =====
const levelTabs = document.getElementById('levelTabs');
const tableBody = document.getElementById('tableBody');
const leaderboardTable = document.getElementById('leaderboardTable');
const emptyState = document.getElementById('emptyState');
const loading = document.getElementById('loading');
const btnRefresh = document.getElementById('btnRefresh');

// ===== 页面加载 =====
document.addEventListener('DOMContentLoaded', () => {
    loadLevels();       // 先加载关卡列表
    loadLeaderboard();   // 再加载排行榜数据
});

// 刷新按钮点击
btnRefresh.addEventListener('click', () => {
    loadLeaderboard(currentLevel);
});

// ===== 获取关卡列表 =====
async function loadLevels() {
    try {
        const response = await fetch(API_LEVELS);
        const data = await response.json();
        levelsCache = data.levels || [];

        // 渲染关卡切换按钮
        renderLevelTabs();
    } catch (error) {
        console.error('获取关卡列表失败:', error);
        // 接口不可用时显示默认按钮
        levelsCache = [
            { id: 1, name: '初级', size: 11 },
            { id: 2, name: '中级', size: 21 },
            { id: 3, name: '高级', size: 31 }
        ];
        renderLevelTabs();
    }
}

// ===== 渲染关卡切换按钮 =====
function renderLevelTabs() {
    levelTabs.innerHTML = '';

    // "全部"按钮
    const allBtn = document.createElement('button');
    allBtn.className = `level-btn ${currentLevel === null ? 'active' : ''}`;
    allBtn.textContent = '全部关卡';
    allBtn.addEventListener('click', () => {
        currentLevel = null;
        loadLeaderboard(null);
        setActiveTab(allBtn);
    });
    levelTabs.appendChild(allBtn);

    // 各关卡按钮
    levelsCache.forEach(level => {
        const btn = document.createElement('button');
        btn.className = `level-btn ${currentLevel === level.id ? 'active' : ''}`;
        btn.textContent = `${level.name} (${level.size}×${level.size})`;
        btn.addEventListener('click', () => {
            currentLevel = level.id;
            loadLeaderboard(level.id);
            setActiveTab(btn);
        });
        levelTabs.appendChild(btn);
    });
}

// ===== 切换按钮高亮 =====
function setActiveTab(activeBtn) {
    document.querySelectorAll('.level-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    activeBtn.classList.add('active');
}

// ===== 获取排行榜数据 =====
async function loadLeaderboard(level) {
    // 显示加载状态
    showLoading(true);

    try {
        // 构造请求 URL
        let url = API_LEADERBOARD;
        if (level !== null && level !== undefined) {
            url = `${API_LEADERBOARD}?level=${level}`;
        }

        // 调用后端接口：GET /api/leaderboard?level=N
        const response = await fetch(url);
        const data = await response.json();

        // 数据结构：数组，存储排行榜记录
        // 响应格式：{ "scores": [{"rank":1, "player":"张三", "time":35, "level":1}, ...] }
        scoresData = data.scores || [];

        // 前端排序：按通关时间升序排列（时间短排前面）
        // 排序算法：比较排序，时间复杂度 O(n log n)
        scoresData.sort((a, b) => a.time - b.time);

        // 重新分配排名
        scoresData.forEach((item, index) => {
            item.rank = index + 1;
        });

        // 渲染表格
        renderTable();

    } catch (error) {
        console.error('获取排行榜失败:', error);
        showEmpty();
    } finally {
        showLoading(false);
    }
}

// ===== 渲染排行榜表格 =====
function renderTable() {
    if (scoresData.length === 0) {
        showEmpty();
        return;
    }

    // 显示表格，隐藏空状态
    leaderboardTable.style.display = 'table';
    emptyState.style.display = 'none';

    // 生成表格行
    tableBody.innerHTML = '';

    scoresData.forEach((score, index) => {
        const tr = document.createElement('tr');

        // 前三名特殊样式
        if (score.rank === 1) {
            tr.classList.add('rank-1');
        } else if (score.rank === 2) {
            tr.classList.add('rank-2');
        } else if (score.rank === 3) {
            tr.classList.add('rank-3');
        }

        // 排名列（前三名用奖牌）
        let rankHtml = '';
        if (score.rank === 1) {
            rankHtml = '<span class="rank-medal">🥇</span>';
        } else if (score.rank === 2) {
            rankHtml = '<span class="rank-medal">🥈</span>';
        } else if (score.rank === 3) {
            rankHtml = '<span class="rank-medal">🥉</span>';
        } else {
            rankHtml = `#${score.rank}`;
        }

        // 获取关卡名称
        const levelName = getLevelName(score.level);

        tr.innerHTML = `
            <td>${rankHtml}</td>
            <td>${escapeHtml(score.player)}</td>
            <td>${score.time} 秒</td>
            <td>${levelName}</td>
        `;

        tableBody.appendChild(tr);
    });
}

// ===== 获取关卡名称 =====
function getLevelName(levelId) {
    const level = levelsCache.find(l => l.id === levelId);
    return level ? level.name : `关卡 ${levelId}`;
}

// ===== 防 XSS 转义 =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== UI 状态切换 =====
function showLoading(show) {
    loading.style.display = show ? 'block' : 'none';
    if (show) {
        leaderboardTable.style.display = 'none';
        emptyState.style.display = 'none';
    }
}

function showEmpty() {
    leaderboardTable.style.display = 'none';
    emptyState.style.display = 'block';
    loading.style.display = 'none';
}
