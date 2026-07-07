# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
"""
一键启动：前端HTTP服务 + 后端两个API服务
前后端分离，三个端口独立
"""
import subprocess
import sys
import os
import time
import webbrowser
import urllib.request

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

processes = []


def check_ready(url, retries=10):
    """轮询检查服务是否就绪"""
    for i in range(retries):
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except:
            time.sleep(0.5)
    return False


try:
    # 1. 启动迷宫 API (port 5001)
    print("[1/3] 启动迷宫生成API (port 5001)...")
    p1 = subprocess.Popen(
        [sys.executable, os.path.join(PROJECT_DIR, 'backend', 'maze-api', 'app.py')],
    )
    processes.append(('迷宫API (5001)', p1))
    if check_ready('http://localhost:5001/api/maze/generate?width=5&height=5'):
        print("       ✅ 迷宫API 就绪")
    else:
        print("       ❌ 迷宫API 启动超时，请检查！")

    # 2. 启动游戏 API (port 5002)
    print("[2/3] 启动排行榜API (port 5002)...")
    p2 = subprocess.Popen(
        [sys.executable, os.path.join(PROJECT_DIR, 'backend', 'game-api', 'app.py')],
    )
    processes.append(('游戏API (5002)', p2))
    if check_ready('http://localhost:5002/api/levels'):
        print("       ✅ 游戏API 就绪")
    else:
        print("       ❌ 游戏API 启动超时，请检查！")

    # 3. 启动前端 HTTP 服务 (port 5500)
    print("[3/3] 启动前端服务 (port 5500)...")
    p3 = subprocess.Popen(
        [sys.executable, '-m', 'http.server', '5500', '--directory', FRONTEND_DIR],
    )
    processes.append(('前端服务 (5500)', p3))
    if check_ready('http://localhost:5500/maze-game/index.html'):
        print("       ✅ 前端服务 就绪")
    else:
        print("       ❌ 前端服务 启动超时，请检查！")

    print()
    print("✅ 全部启动完成！")
    print(f"   浏览器打开 → http://localhost:5500/maze-game/index.html")
    print()
    print("   按 Ctrl+C 停止所有服务...")
    print()

    # 自动打开浏览器
    webbrowser.open('http://localhost:5500/maze-game/index.html')

    # 等待用户 Ctrl+C
    while True:
        time.sleep(1)

except KeyboardInterrupt:
    print()
    print("正在停止所有服务...")
    for name, p in processes:
        try:
            p.terminate()
            p.wait(timeout=3)
            print(f"  ✅ {name} 已停止")
        except:
            try:
                p.kill()
                print(f"  ⚠️ {name} 已强制停止")
            except:
                print(f"  ❌ {name} 停止失败")
    print("全部已停止。")
