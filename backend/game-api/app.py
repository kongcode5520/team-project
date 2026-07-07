"""
游戏 API — 队员D 负责此模块
排行榜、关卡管理、成绩存储

端口：5002
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os

app = Flask(__name__)
CORS(app)  # 必须加！否则前端跨域调不到

# 数据库文件路径
DB_PATH = os.path.join(os.path.dirname(__file__), 'data.db')


# ============================================================
# 数据库初始化
# 数据结构：SQLite 关系型数据库表，用于持久化存储成绩
# ============================================================

def init_db():
    """启动时自动建表"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player TEXT NOT NULL,
            time INTEGER NOT NULL,
            level INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()


def get_db():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # 让查询结果支持字典式访问
    return conn


# ============================================================
# 接口 1：提交成绩
# POST /api/score
# 请求体: { "player": "玩家名", "time": 35, "level": 1 }
# 返回:   { "success": true, "message": "成绩已保存" }
# ============================================================

@app.route('/api/score', methods=['POST'])
def submit_score():
    """提交成绩 — 将玩家通关数据存入 SQLite 数据库"""
    data = request.get_json()

    # 解析请求体（前端严格按此格式发送）
    player = data.get('player', '')
    time = data.get('time', 0)
    level = data.get('level', 1)

    # 参数校验
    if not player or not isinstance(player, str):
        return jsonify({"success": False, "message": "玩家名不能为空"}), 400
    if not isinstance(time, int) or time <= 0:
        return jsonify({"success": False, "message": "时间必须为正整数"}), 400
    if not isinstance(level, int) or level <= 0:
        return jsonify({"success": False, "message": "关卡编号无效"}), 400

    # 写入数据库
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO scores (player, time, level) VALUES (?, ?, ?)',
        (player.strip(), time, level)
    )
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "message": "成绩已保存"
    })


# ============================================================
# 接口 2：获取排行榜
# GET /api/leaderboard?level=1
# 返回: { "scores": [{"rank":1, "player":"张三", "time":35, "level":1}, ...] }
#
# 规则：
# - 按 time 升序排列（时间短排前面）
# - 只返回前10名
# - level 参数可选，不传则返回所有关卡
#
# 数据结构：列表/数组，用于存储和排序排行榜数据
# 排序算法：基于分数的比较排序，按通关时间升序
# 时间复杂度：排序 O(n log n)，查询 O(n)
# ============================================================

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    """获取排行榜 — 返回指定关卡的前10名"""

    # 获取 level 参数（可选）
    level_param = request.args.get('level', type=int)

    conn = get_db()
    cursor = conn.cursor()

    # 按关卡过滤或查询全部
    # 数据结构：列表/数组，用于存储和排序排行榜数据
    if level_param:
        cursor.execute(
            'SELECT player, time, level FROM scores WHERE level = ? ORDER BY time ASC LIMIT 10',
            (level_param,)
        )
    else:
        cursor.execute(
            'SELECT player, time, level FROM scores ORDER BY time ASC LIMIT 10'
        )

    rows = cursor.fetchall()
    conn.close()

    # 组装返回数据，rank 从 1 开始
    # 排序算法：基于分数的比较排序，按通关时间升序（SQL ORDER BY time ASC 已完成）
    scores = []
    for i, row in enumerate(rows):
        scores.append({
            "rank": i + 1,
            "player": row['player'],
            "time": row['time'],
            "level": row['level']
        })

    return jsonify({"scores": scores})


# ============================================================
# 接口 3：获取关卡列表
# GET /api/levels
# 返回: { "levels": [{"id":1, "name":"初级", "size":11}, ...] }
#
# 暂时写死返回 3 个关卡即可
# ============================================================

@app.route('/api/levels', methods=['GET'])
def get_levels():
    """获取关卡列表 — 返回所有可用关卡"""
    # 暂时写死 3 个关卡
    levels = [
        {"id": 1, "name": "初级", "size": 11},
        {"id": 2, "name": "中级", "size": 21},
        {"id": 3, "name": "高级", "size": 31}
    ]
    return jsonify({"levels": levels})


# ============================================================
# 启动入口
# ============================================================

if __name__ == '__main__':
    # 启动时自动建表
    init_db()
    print("✅ 游戏 API 已启动 (队员D)")
    print("   - POST /api/score       提交成绩")
    print("   - GET  /api/leaderboard 排行榜")
    print("   - GET  /api/levels      关卡列表")
    print("   端口: 5002")
    app.run(port=5002, debug=True)
