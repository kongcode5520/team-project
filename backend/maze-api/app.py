"""
迷宫生成 API - 队员C负责此模块
使用 DFS 栈算法生成迷宫
"""
from flask import Flask, jsonify

app = Flask(__name__)


@app.route('/api/maze/generate', methods=['GET'])
def generate_maze():
    """生成随机迷宫，返回二维数组"""
    # TODO: 队员C实现迷宫生成算法
    return jsonify({"message": "迷宫生成API - 队员C负责", "maze": []})


if __name__ == '__main__':
    app.run(port=5001, debug=True)
