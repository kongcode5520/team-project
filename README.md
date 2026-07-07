# 迷宫游戏 - 团队项目

## 项目结构
```
team-project/
├── frontend/          # 前端（HTML/CSS/JS）
│   ├── maze-game/     # 队员A: 迷宫渲染+操控
│   └── leaderboard/   # 队员B: 排行榜页面
├── backend/           # 后端（Python Flask）
│   ├── maze-api/      # 队员C: 迷宫生成API
│   └── game-api/      # 队员D: 排行榜+关卡API
└── docs/              # 文档和报告
```

## 技术栈
- 前端: HTML + CSS + JavaScript
- 后端: Python + Flask
- 数据库: SQLite

## 快速开始（队友必看）

### 1. 克隆项目
```bash
git clone https://github.com/kongcode5520/team-project.git
cd team-project
```

### 2. 安装依赖（任选一种方式）

**方式A：一键安装所有依赖**
```bash
pip install flask flask-cors
```

**方式B：分别安装**
```bash
pip install -r backend/maze-api/requirements.txt
pip install -r backend/game-api/requirements.txt
```

### 3. 启动项目

**方式A：一键启动（推荐）**
在 PyCharm 里右键 `start.py` → Run，自动启动全部服务并打开浏览器。

**方式B：手动启动（三个终端）**
```bash
python backend/maze-api/app.py    # 终端1：迷宫API (port 5001)
python backend/game-api/app.py    # 终端2：游戏API (port 5002)
python -m http.server 5500 --directory frontend   # 终端3：前端 (port 5500)
```

### 4. 打开浏览器
- 迷宫游戏: http://localhost:5500/maze-game/index.html
- 排行榜:   http://localhost:5500/leaderboard/index.html

## 依赖清单
| 依赖 | 用途 |
|------|------|
| Python 3.x | 运行环境 |
| flask | Web 框架 |
| flask-cors | 跨域支持 |

## Git 协作流程
1. 每人创建自己的分支: `git checkout -b feature/你的模块名`
2. 开发完成后推送到自己的分支
3. 在 GitHub 上发起 Pull Request 合并到 main
