# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

"""
迷宫生成 API — Flask 后端
======================
算法：深度优先搜索（DFS）+ 回溯
# 数据结构：栈（Stack），用于DFS迷宫生成的回溯
# 数据结构：二维数组/矩阵，存储迷宫地图
# 算法：深度优先搜索（DFS） + 回溯

栈的作用（图解说明）：
  前进时 push → 记录当前路径（走过的路）
  无路可走时 pop → 回到上一个分叉点
  这就是 DFS 的回溯机制

示例：
  当前位置 (1,1)，随机选邻居 (3,1)
  → push (3,1)   # 前进，记录路径
  当前位置 (3,1)，随机选邻居 (3,3)
  → push (3,3)   # 前进，记录路径
  当前位置 (3,3)，无未访问邻居（四周都访问过了）
  → pop → 回到 (3,1)   # 回溯到上一个分叉点
  当前位置 (3,1)，检查其他方向...
"""

import random
import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
# 启用 CORS 跨域支持
CORS(app)

# 前端文件目录
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'frontend')
MAZE_GAME_DIR = os.path.join(FRONTEND_DIR, 'maze-game')

def generate_maze(width, height):
    """
    使用 DFS（深度优先搜索）+ 栈 生成迷宫

    算法步骤：
    1. 初始化全为墙（1）的二维数组
    2. 从 (1,1) 开始，设为路（0）
    3. 使用栈记录访问路径：
       - 将当前格子压入栈
       - 随机选择一个未访问的相邻格子（间隔 2 格）
       - 打通中间的墙
       - 将该相邻格子设为当前格子，压入栈
       - 如果没有未访问的相邻格子，从栈中弹出（回溯）
    4. 重复直到栈为空，迷宫生成完毕

    Args:
        width:  迷宫宽度（列数），必须是奇数
        height: 迷宫高度（行数），必须是奇数

    Returns:
        dict: {"maze": 二维数组, "width": 宽度, "height": 高度}
    """
    # 宽度和高度必须是奇数；如果传入偶数，自动 +1 变成奇数
    if width % 2 == 0:
        width += 1
    if height % 2 == 0:
        height += 1

    # 数据结构：二维数组/矩阵，存储迷宫地图
    # 初始化迷宫，全部填充为 1（墙）
    maze = [[1 for _ in range(width)] for _ in range(height)]

    # 起点永远是 (1, 1)，设为路（0）
    start_x, start_y = 1, 1
    maze[start_y][start_x] = 0

    # 数据结构：栈（Stack），用于DFS迷宫生成的回溯
    # 栈中存储已访问的格子坐标 (x, y)
    stack = [(start_x, start_y)]

    # 四个移动方向：右、下、左、上（每次移动间隔 2 格）
    directions = [(0, 2), (2, 0), (0, -2), (-2, 0)]

    # 算法：深度优先搜索（DFS） + 回溯
    # 当栈不为空时，持续生成迷宫
    while stack:
        # 查看栈顶元素（当前所在格子）
        current_x, current_y = stack[-1]

        # 收集所有未访问的邻居（间隔 2 格的格子）
        unvisited_neighbors = []
        for dx, dy in directions:
            nx = current_x + dx  # 邻居的 x 坐标
            ny = current_y + dy  # 邻居的 y 坐标

            # 检查邻居是否在迷宫范围内，且未被访问（仍是墙）
            if (0 < nx < width - 1 and 0 < ny < height - 1
                    and maze[ny][nx] == 1):
                unvisited_neighbors.append((nx, ny))

        if unvisited_neighbors:
            # 有未访问的邻居：随机选择一个
            next_x, next_y = random.choice(unvisited_neighbors)

            # 打通当前格子和邻居之间的墙
            # 中间墙的坐标 = (current + next) / 2
            wall_x = (current_x + next_x) // 2
            wall_y = (current_y + next_y) // 2
            maze[wall_y][wall_x] = 0

            # 将邻居设为路（0）
            maze[next_y][next_x] = 0

            # 前进：将邻居压入栈，记录当前路径
            stack.append((next_x, next_y))
        else:
            # 无路可走：从栈中弹出，回到上一个分叉点（回溯）
            stack.pop()

    # 终点永远是 (width-2, height-2)，确保是路（0）
    end_x = width - 2
    end_y = height - 2
    maze[end_y][end_x] = 0
    # 起点也确保是路（0）
    maze[1][1] = 0

    return {
        "maze": maze,
        "width": width,
        "height": height,
    }


@app.route("/api/maze/generate", methods=["GET"])
def maze_generate():
    """
    接口：生成迷宫
    ==============
    请求方式：GET
    URL 参数：
        width  (int, 可选, 默认 21): 迷宫宽度（列数）
        height (int, 可选, 默认 21): 迷宫高度（行数）

    返回格式（JSON）：
        {
            "maze": [[0,1,0,0,1,...], [1,0,0,1,0,...], ...],
            "width": 21,
            "height": 21
        }

    说明：
        - maze: 二维数组，0=路，1=墙
        - width: 迷宫宽度（列数）
        - height: 迷宫高度（行数）
        - 起点固定: maze[1][1] = 0
        - 终点固定: maze[height-2][width-2] = 0
        - width 和 height 如果不是奇数，自动 +1 处理
    """
    # 从 URL 查询参数中获取 width 和 height，默认值均为 21
    try:
        width = int(request.args.get("width", 21))
    except ValueError:
        # 如果传入的不是整数，使用默认值
        width = 21

    try:
        height = int(request.args.get("height", 21))
    except ValueError:
        # 如果传入的不是整数，使用默认值
        height = 21

    # 调用迷宫生成函数
    result = generate_maze(width, height)

    # 返回 JSON 格式的迷宫数据
    return jsonify(result)


# ===== 静态文件服务：让浏览器直接访问 localhost:5001 就能玩 =====
# 注意：必须放在所有 /api/ 路由之后，否则 API 请求会被当作静态文件处理

@app.route('/')
def serve_maze_game():
    """提供迷宫游戏首页"""
    return send_from_directory(MAZE_GAME_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_maze_static(filename):
    """提供迷宫游戏的 CSS、JS 等静态资源"""
    return send_from_directory(MAZE_GAME_DIR, filename)


if __name__ == "__main__":
    print("[OK] Maze API started (Player C)")
    print("   Frontend: http://localhost:5001")
    print("   API:      http://localhost:5001/api/maze/generate?width=21&height=21")
    # 启动 Flask 应用，监听 5001 端口
    app.run(host="0.0.0.0", port=5001, debug=True)
