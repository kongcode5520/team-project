# 队员D 提示词：排行榜 + 关卡 API

把这个提示词直接复制，发给 Claude Code 或其他 AI Agent 即可。

---

## 粘贴给 Agent 的完整提示词：

```
帮我完善游戏 API，修改 backend/game-api/app.py 文件。

## 要求：

### API 接口：

1. POST /api/score
   - 接收：{ "player": "玩家名", "time": 35, "level": 1 }
   - 存入数据库
   - 返回：{ "success": true, "message": "成绩已保存" }

2. GET /api/leaderboard?level=1
   - 从数据库查询该关卡的所有成绩
   - 按通关时间升序排序（时间短排前面）
   - 返回前10名：
   {
     "scores": [
       {"rank": 1, "player": "张三", "time": 35, "level": 1},
       {"rank": 2, "player": "李四", "time": 42, "level": 1},
       ...
     ]
   }

3. GET /api/levels
   - 返回所有关卡列表（暂时写死3个关卡）
   - 返回：{ "levels": [{"id":1,"name":"初级","size":11},{"id":2,"name":"中级","size":21},{"id":3,"name":"高级","size":31}] }

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
- 添加 CORS 跨域支持
- 端口 5002
- 代码注释写清楚，每个接口的功能说明

请一次性生成完整代码，不要省略。
```
