"""
游戏 API - 队员D负责此模块
排行榜、关卡管理、成绩存储
"""
from flask import Flask, jsonify

app = Flask(__name__)


@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    """获取排行榜前十名"""
    # TODO: 队员D实现排行榜功能
    return jsonify({"message": "排行榜API - 队员D负责", "scores": []})


@app.route('/api/score', methods=['POST'])
def submit_score():
    """提交成绩"""
    return jsonify({"message": "提交成绩API - 队员D负责"})


if __name__ == '__main__':
    app.run(port=5002, debug=True)
