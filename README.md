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

## Git 协作流程
1. 每人创建自己的分支: `git checkout -b feature/你的模块名`
2. 开发完成后推送到自己的分支
3. 在 GitHub 上发起 Pull Request 合并到 main
