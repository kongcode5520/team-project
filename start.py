# -*- coding: utf-8 -*-
"""
一键启动：前端HTTP服务 + 后端两个API服务
前后端分离，三个端口独立
"""
import subprocess
import sys
import os
import time
import webbrowser

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(PROJECT_DIR, 'frontend')

print("=" * 50)
print("  迷宫游戏 — 一键启动")
print("=" * 50)
print()
print("  前端 (静态文件):  http://localhost:5500/maze-game/")
print("  迷宫 API:         http://localhost:5001")
print("  游戏 API:         http://localhost:5002")
print()
print("  启动后浏览器会自动打开前端页面")
print("  按 Ctrl+C 全部停止")
print()

processes = []

try:
    # 1. 启动迷宫 API (port 5001)
    print("[1/3] 启动迷宫生成API...")
    p1 = subprocess.Popen(
        [sys.executable, os.path.join(PROJECT_DIR, 'backend', 'maze-api', 'app.py')],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    processes.append(('迷宫API', p1))
    time.sleep(1)

    # 2. 启动游戏 API (port 5002)
    print("[2/3] 启动排行榜API...")
    p2 = subprocess.Popen(
        [sys.executable, os.path.join(PROJECT_DIR, 'backend', 'game-api', 'app.py')],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    processes.append(('游戏API', p2))
    time.sleep(1)

    # 3. 启动前端 HTTP 服务 (port 5500)
    print("[3/3] 启动前端服务...")
    p3 = subprocess.Popen(
        [sys.executable, '-m', 'http.server', '5500', '--directory', FRONTEND_DIR],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    processes.append(('前端服务', p3))
    time.sleep(0.5)

    print()
    print("全部启动完成！")
    print("浏览器打开 → http://localhost:5500/maze-game/index.html")
    print()
    print("按 Ctrl+C 停止所有服务...")

    # 自动打开浏览器
    webbrowser.open('http://localhost:5500/maze-game/index.html')

    # 等待任意子进程结束（或用户 Ctrl+C）
    while True:
        time.sleep(1)

except KeyboardInterrupt:
    print()
    print("正在停止所有服务...")
    for name, p in processes:
        try:
            p.terminate()
            print(f"  {name} 已停止")
        except:
            pass
    print("全部已停止。")
