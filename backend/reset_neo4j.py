"""
清空/重置 Neo4j 数据库

用法:
    python reset_neo4j.py              # 清空所有数据
    python reset_neo4j.py --keep-demo  # 清空后重新初始化演示数据集
"""

import sys
from neo4j_connector import get_driver


def reset(keep_demo: bool = False):
    driver = get_driver()
    with driver.session() as session:
        count = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
        print(f"当前节点数: {count}")

        session.run("MATCH (n) DETACH DELETE n")
        print("已清空所有数据")

        if keep_demo:
            try:
                from migrate_to_neo4j import migrate
                migrate()
                print("已重新初始化演示数据集")
            except ImportError:
                print("⚠ migrate_to_neo4j 模块不存在，跳过演示数据初始化")


if __name__ == "__main__":
    keep_demo = "--keep-demo" in sys.argv
    reset(keep_demo=keep_demo)
