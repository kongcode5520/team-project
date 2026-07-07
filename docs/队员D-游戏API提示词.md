# 队员D 提示词：排行榜 + 关卡 API

把这个提示词直接复制，发给 Claude Code 或其他 AI Agent 即可。

---

## 粘贴给 Agent 的完整提示词：

```
帮我完善游戏 API，修改 backend/game-api/app.py 文件。

## 要求：

### ⚠️ 接口规范（必须严格实现！前端队员按此格式调用）

你负责实现后端接口。以下是你必须实现的接口：

**接口1：提交成绩**
请求：POST /api/score
Content-Type: application/json

请求体格式（前端会严格按此格式发送）：
{
  "player": "玩家名",
  "time": 35,
  "level": 1
}

响应格式（必须严格返回）：
{
  "success": true,
  "message": "成绩已保存"
}

字段说明：
- player: 字符串，玩家名称
- time: 整数，通关用时（秒）
- level: 整数，关卡编号
- 需要将数据存入 SQLite 数据库

**接口2：获取排行榜**
请求：GET /api/leaderboard?level=1

响应格式（必须严格返回此格式，字段名不能改）：
{
  "scores": [
    {"rank": 1, "player": "张三", "time": 35, "level": 1},
    {"rank": 2, "player": "李四", "time": 42, "level": 1}
  ]
}

字段说明：
- rank: 整数，排名（从1开始）
- player: 字符串，玩家名称
- time: 整数，通关时间（秒）
- level: 整数，关卡编号
- 按 time 升序排列（时间短排前面）
- 只返回前10名
- level 参数可选，不传则返回所有关卡

**接口3：获取关卡列表**
请求：GET /api/levels

响应格式（必须严格返回此格式）：
{
  "levels": [
    {"id": 1, "name": "初级", "size": 11},
    {"id": 2, "name": "中级", "size": 21},
    {"id": 3, "name": "高级", "size": 31}
  ]
}

字段说明：
- id: 整数，关卡编号
- name: 字符串，关卡名称
- size: 整数，迷宫大小（正方形边长，奇数）

这个暂时写死返回3个关卡即可。

### 数据库要求：
- 使用 SQLite，文件存放在 backend/game-api/data.db
- 表结构：
  scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT NOT NULL,
    time INTEGER NOT NULL,
    level INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
- 启动时自动建表

### 数据结构要求（在代码注释里标注）：
- "# 数据结构：列表/数组，用于存储和排序排行榜数据"
- "# 排序算法：基于分数的比较排序，按通关时间升序"
- "# 数据结构：SQLite 关系型数据库表，用于持久化存储成绩"
- "# 时间复杂度：排序 O(n log n)，查询 O(n)"

### 额外要求：
- 添加 CORS 跨域支持（必须加，用 flask_cors 的 CORS(app)）
- 端口 5002
- 代码注释写清楚，每个接口的功能说明
- 依赖写在 requirements.txt 里：flask 和 flask-cors

请一次性生成完整代码，不要省略。
```
