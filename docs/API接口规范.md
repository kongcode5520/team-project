# 迷宫游戏 — API 接口规范

> ⚠️ 所有人必须严格按这个文档来，否则代码拼不起来。

---

## 整体架构

```
队员A（前端） ──→ GET  /api/maze/generate  ──→ 队员C（后端 port 5001）
队员A（前端） ──→ POST /api/score           ──→ 队员D（后端 port 5002）

队员B（前端） ──→ GET  /api/leaderboard     ──→ 队员D（后端 port 5002）
队员B（前端） ──→ GET  /api/levels          ──→ 队员D（后端 port 5002）
```

---

## 端口分配

| 端口 | 服务 | 负责 |
|------|------|------|
| 5001 | 迷宫生成 API | 队员C |
| 5002 | 游戏 API（排行榜+成绩） | 队员D |
| 5500 | 前端（VS Code Live Server 或直接打开） | 队员A/队员B |

---

## 接口 1：生成迷宫 [队员C 实现]

```
GET http://localhost:5001/api/maze/generate?width=21&height=21

返回格式：
{
  "maze": [
    [0, 1, 0, 0, 1, ...],   // 第1行，共 width 列
    [1, 0, 0, 1, 0, ...],   // 第2行
    ...
  ],
  "width": 21,
  "height": 21
}

字段说明：
- maze：二维数组，0=路，1=墙
- width：迷宫宽度（列数）
- height：迷宫高度（行数）
- 起点永远是 maze[1][1]，终点永远是 maze[height-2][width-2]
- 宽高必须是奇数（保证迷宫能生成）
```

---

## 接口 2：提交成绩 [队员D 实现]

```
POST http://localhost:5002/api/score
Content-Type: application/json

请求体：
{
  "player": "玩家名",
  "time": 35,
  "level": 1
}

返回：
{
  "success": true,
  "message": "成绩已保存"
}

字段说明：
- player：字符串，玩家名称
- time：整数，通关用时（秒）
- level：整数，关卡编号
```

---

## 接口 3：获取排行榜 [队员D 实现]

```
GET http://localhost:5002/api/leaderboard?level=1

返回：
{
  "scores": [
    {"rank": 1, "player": "张三", "time": 35, "level": 1},
    {"rank": 2, "player": "李四", "time": 42, "level": 1},
    ...
  ]
}

说明：
- 只返回前10名
- 按 time 升序排列（时间短排前面）
- level 参数可选，不传则返回所有关卡
```

---

## 接口 4：获取关卡列表 [队员D 实现]

```
GET http://localhost:5002/api/levels

返回：
{
  "levels": [
    {"id": 1, "name": "初级", "size": 11},
    {"id": 2, "name": "中级", "size": 21},
    {"id": 3, "name": "高级", "size": 31}
  ]
}

字段说明：
- id：关卡编号
- name：关卡名称
- size：迷宫大小（正方形边长，必须是奇数）
```

---

## CORS 跨域

两个后端都必须设置 CORS，允许所有来源访问：
```python
from flask_cors import CORS
CORS(app)
```

---

## 前端调用示例（队员A、B参考）

```javascript
// 获取迷宫
const res = await fetch('http://localhost:5001/api/maze/generate?width=21&height=21');
const data = await res.json();
// data.maze 就是二维数组

// 提交成绩
await fetch('http://localhost:5002/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player: '小明', time: 35, level: 1 })
});

// 获取排行榜
const res = await fetch('http://localhost:5002/api/leaderboard?level=1');
const data = await res.json();
// data.scores 是排名数组
```
