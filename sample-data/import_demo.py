#!/usr/bin/env python3
"""
Phase 4 演示数据集批量导入脚本
按正确顺序（供应商→原材料→零部件→产品→工厂→链路）通过 API 导入所有 CSV。

用法:
    python docs/sample-data/import_demo.py

前置条件:
    - Neo4j Docker 运行中 (docker ps | grep neo4j)
    - 后端运行中 (curl http://localhost:8765/api/health)
"""

import csv
import io
import os
import sys
import urllib.request
import urllib.error

API_BASE = "http://localhost:8765"
SAMPLE_DIR = os.path.join(os.path.dirname(__file__))

# 导入顺序：先节点（按外键依赖），后链路
IMPORT_ORDER = [
    ("suppliers", "suppliers_demo.csv", "供应商"),
    ("raw-materials", "raw_materials_demo.csv", "原材料"),
    ("components", "components_demo.csv", "零部件"),
    ("final-products", "final_products_demo.csv", "最终产品"),
    ("factories", "factories_demo.csv", "工厂"),
    ("links", "links_demo.csv", "语义链路"),
]


def check_health():
    """检查后端是否在运行"""
    try:
        resp = urllib.request.urlopen(f"{API_BASE}/api/health")
        return resp.status == 200
    except Exception:
        return False


def import_csv(object_type: str, filepath: str) -> dict:
    """通过 API 导入单个 CSV 文件"""
    import multipart  # 需要安装 python-multipart

    url = f"{API_BASE}/api/data/import/{object_type}"
    boundary = "----Boundary7MA4YWxkTrZu0gW"

    with open(filepath, "rb") as f:
        file_data = f.read()

    filename = os.path.basename(filepath)

    # 构建 multipart/form-data 请求体
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: text/csv\r\n\r\n"
    ).encode("utf-8") + file_data + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = resp.read().decode("utf-8")
            import json
            return json.loads(result)
    except urllib.error.HTTPError as e:
        return {"status": "error", "http_code": e.code, "detail": e.read().decode("utf-8")}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


def count_csv_rows(filepath: str) -> int:
    """统计 CSV 行数（不含表头）"""
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return sum(1 for _ in reader)


def main():
    print("=" * 60)
    print("  Phase 4 演示数据集批量导入")
    print("=" * 60)

    # 1. 检查健康状态
    print(f"\n🔍 检查后端健康状态... ({API_BASE})")
    if not check_health():
        print("  ❌ 后端未运行！请先执行: cd backend && python main.py")
        print(f"  或检查: curl {API_BASE}/api/health")
        sys.exit(1)
    print("  ✅ 后端运行正常")

    # 2. 按顺序导入
    total_imported = 0
    total_failed = 0
    total_rows = 0

    print("\n📦 开始导入...\n")

    for obj_type, filename, label in IMPORT_ORDER:
        filepath = os.path.join(SAMPLE_DIR, filename)
        rows = count_csv_rows(filepath)
        total_rows += rows

        print(f"  [{label}] {filename} ({rows} 行)...", end=" ", flush=True)

        result = import_csv(obj_type, filepath)
        status = result.get("status", "")

        if status == "success":
            imported = result.get("imported", 0)
            failed = result.get("failed", 0)
            total_imported += imported
            total_failed += failed
            print(f"✅ 导入 {imported} 行" + (f", {failed} 行失败" if failed else ""))
        elif status == "validation_failed":
            errors = result.get("errors", [])
            print(f"⚠️ 校验失败: {len(errors)} 个错误")
            for err in errors[:5]:
                print(f"      行 {err.get('row')} 字段 {err.get('field')}: {err.get('msg')}")
            total_failed += rows
        else:
            print(f"❌ 失败: {result.get('detail', str(result))}")
            total_failed += rows

        # 导入后刷新图谱
        if status == "success" and result.get("imported", 0) > 0:
            try:
                urllib.request.urlopen(f"{API_BASE}/api/graph", timeout=5)
            except Exception:
                pass  # 忽略，只是触发图谱重建

    # 3. 汇总
    print(f"\n{'=' * 60}")
    print(f"  📊 汇总")
    print(f"  CSV 总行数:  {total_rows}")
    print(f"  成功导入:    {total_imported}")
    print(f"  失败:        {total_failed}")
    print(f"  前端地址:    http://localhost:5173")
    print(f"  Neo4j:       http://localhost:7474 (user: neo4j)")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
