"""
数据库层 — 新能源电池制造供应链本体
使用 Faker 生成 50+ 节点、错综复杂的边，模拟真实工业 ERP 数据。
"""

import sqlite3
import os
import random
import json
from faker import Faker

fake = Faker("zh_CN")
random.seed(42)
fake.seed_instance(42)

DB_PATH = os.path.join(os.path.dirname(__file__), "ontology.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """初始化表结构并填充新能源电池制造供应链数据（50+ 节点）"""
    conn = get_connection()
    cur = conn.cursor()

    # =====================================================
    # 表结构定义
    # =====================================================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            risk_level TEXT NOT NULL CHECK(risk_level IN ('High', 'Medium', 'Low')),
            on_time_delivery_rate REAL NOT NULL,
            location TEXT NOT NULL,
            contact TEXT,
            certification TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS raw_materials (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            stock REAL NOT NULL,
            threshold REAL NOT NULL,
            quality_score REAL NOT NULL,
            unit TEXT DEFAULT '吨',
            supplier_id TEXT NOT NULL,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS components (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            stock INTEGER NOT NULL,
            daily_consumption REAL NOT NULL,
            unit TEXT DEFAULT '件',
            defect_rate REAL DEFAULT 0
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS final_products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            target_yield INTEGER NOT NULL,
            current_yield INTEGER NOT NULL,
            unit TEXT DEFAULT '台',
            factory_id TEXT,
            FOREIGN KEY (factory_id) REFERENCES factories(id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS factories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            location TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('Running', 'Maintenance', 'Shutdown')),
            capacity_utilization REAL DEFAULT 0,
            headcount INTEGER DEFAULT 0
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            link_type TEXT NOT NULL,
            label TEXT NOT NULL
        )
    """)

    # 清空重填（幂等）
    for tbl in ["links", "final_products", "components", "raw_materials", "factories", "suppliers"]:
        cur.execute(f"DELETE FROM {tbl}")

    # =====================================================
    # 1. 供应商 (Suppliers) — 8 个
    # =====================================================
    supplier_data = [
        # id, name, risk, on_time, location, contact, cert
        ("SUP-001", "刚果钴矿供应集团", "High", 0.62, "刚果-卢本巴希", "Mr. Kabila", "ISO 9001"),
        ("SUP-002", "赣锋锂业有限公司", "Low", 0.95, "中国-江西新余", "王总", "IATF 16949"),
        ("SUP-003", "宁德时代上游原料事业部", "Low", 0.91, "中国-福建宁德", "陈总监", "IATF 16949"),
        ("SUP-004", "华友钴业新材料集团", "Medium", 0.78, "中国-浙江桐乡", "张经理", "ISO 14001"),
        ("SUP-005", "澳大利亚锂矿开采联合体", "Medium", 0.82, "澳大利亚-珀斯", "Ms. Wilson", "ISO 9001"),
        ("SUP-006", "巴斯夫正极材料事业部", "Low", 0.93, "德国-路德维希港", "Dr. Müller", "IATF 16949"),
        ("SUP-007", "住友金属矿产株式会社", "Medium", 0.85, "日本-东京", "田中部长", "ISO 9001"),
        ("SUP-008", "金川集团镍钴研究院", "Low", 0.89, "中国-甘肃金昌", "李院长", "IATF 16949"),
    ]
    for s in supplier_data:
        cur.execute(
            "INSERT INTO suppliers VALUES (?, ?, ?, ?, ?, ?, ?)", s
        )

    # =====================================================
    # 2. 原材料 (RawMaterials) — 14 种
    #    【瓶颈设计】：SUP-001 (High Risk) 的钴粉 RM-001 库存极低
    # =====================================================
    raw_material_data = [
        # id, name, stock, threshold, quality, unit, supplier_id
        ("RM-001", "高纯钴粉", 2.3, 20.0, 0.88, "吨", "SUP-001"),      # ← 瓶颈！High Risk 供应商，库存极低
        ("RM-002", "电池级碳酸锂", 85.0, 40.0, 0.95, "吨", "SUP-002"),
        ("RM-003", "六氟磷酸锂电解液", 32.0, 25.0, 0.91, "吨", "SUP-003"),
        ("RM-004", "镍钴锰前驱体(NCM)", 18.5, 20.0, 0.87, "吨", "SUP-004"),  # ← 轻微告警
        ("RM-005", "球形石墨负极材料", 55.0, 30.0, 0.93, "吨", "SUP-005"),
        ("RM-006", "N-甲基吡咯烷酮(NMP)", 28.0, 20.0, 0.90, "吨", "SUP-006"),
        ("RM-007", "氧化锰(MnO₂)", 42.0, 35.0, 0.85, "吨", "SUP-004"),
        ("RM-008", "高纯氢氧化锂", 48.0, 25.0, 0.96, "吨", "SUP-002"),
        ("RM-009", "镍粉(99.9%)", 22.0, 18.0, 0.89, "吨", "SUP-008"),
        ("RM-010", "硫酸钴溶液", 14.9, 15.0, 0.82, "吨", "SUP-004"),       # ← 告警：低于安全线
        ("RM-011", "铝箔集流体", 68.0, 40.0, 0.94, "吨", "SUP-007"),
        ("RM-012", "铜箔集流体", 52.0, 35.0, 0.92, "吨", "SUP-007"),
        ("RM-013", "聚偏氟乙烯(PVDF)", 19.0, 15.0, 0.88, "吨", "SUP-006"),
        ("RM-014", "导电炭黑(Super-P)", 24.0, 20.0, 0.91, "吨", "SUP-003"),
        ("RM-015", "氧化钴(Co₃O₄)", 8.5, 18.0, 0.83, "吨", "SUP-001"),       # High Risk供应商，低库存
        ("RM-016", "钛酸锂(LTO)", 32.0, 25.0, 0.94, "吨", "SUP-005"),
        ("RM-017", "聚丙烯隔膜", 48.0, 30.0, 0.92, "吨", "SUP-007"),
    ]
    for rm in raw_material_data:
        cur.execute(
            "INSERT INTO raw_materials VALUES (?, ?, ?, ?, ?, ?, ?)", rm
        )

    # =====================================================
    # 3. 核心零部件 (Components) — 12 种
    # =====================================================
    component_data = [
        # id, name, stock, daily_consumption, unit, defect_rate
        ("CMP-001", "NCM811 电芯单体", 4500, 800, "件", 0.02),
        ("CMP-002", "磷酸铁锂电芯单体", 6200, 600, "件", 0.01),
        ("CMP-003", "BMS 主控板 v3.2", 820, 150, "件", 0.03),
        ("CMP-004", "电池模组外壳(铝合金)", 2100, 350, "件", 0.01),
        ("CMP-005", "液冷板总成", 400, 200, "件", 0.04),   # ← 告警：仅2天库存
        ("CMP-006", "高压连接器套件", 3400, 500, "件", 0.02),
        ("CMP-007", "熔断保护器(400V)", 5600, 700, "件", 0.01),
        ("CMP-008", "电压采集线束(FPC)", 7200, 900, "件", 0.02),
        ("CMP-009", "电池包密封垫圈", 8900, 1100, "件", 0.01),
        ("CMP-010", "温控传感器模组", 1500, 250, "件", 0.03),
        ("CMP-011", "正极极片(预锂化)", 3200, 450, "件", 0.02),
        ("CMP-012", "负极极片(石墨)", 4800, 500, "件", 0.01),
        ("CMP-013", "电解液注入模块", 2200, 380, "件", 0.02),
        ("CMP-014", "电池包结构框架(钢制)", 980, 180, "件", 0.01),
    ]
    for c in component_data:
        cur.execute(
            "INSERT INTO components VALUES (?, ?, ?, ?, ?, ?)", c
        )

    # =====================================================
    # 4. 生产基地 (Factories) — 须先于 final_products（外键 factory_id）
    # =====================================================
    factory_data = [
        # id, name, location, status, capacity_util, headcount
        ("FAC-001", "宁德超级工厂一期", "中国-福建宁德", "Running", 0.85, 3200),
        ("FAC-002", "常州溧阳制造基地", "中国-江苏常州", "Running", 0.78, 1800),
        ("FAC-003", "合肥新能源总装厂", "中国-安徽合肥", "Running", 0.62, 1500),
        ("FAC-004", "武汉电池回收再生中心", "中国-湖北武汉", "Running", 0.55, 600),
        ("FAC-005", "深圳研发试产线", "中国-广东深圳", "Maintenance", 0.15, 200),
        ("FAC-006", "重庆两江新区制造基地", "中国-重庆", "Running", 0.72, 2100),
    ]
    for f in factory_data:
        cur.execute(
            "INSERT INTO factories VALUES (?, ?, ?, ?, ?, ?)", f
        )

    # =====================================================
    # 5. 最终产品 (FinalProducts)
    # =====================================================
    final_product_data = [
        # id, name, target_yield, current_yield, unit, factory_id
        ("FP-001", "长续航电池包(100kWh)", 500, 385, "台", "FAC-001"),  # 缺口明显
        ("FP-002", "标准续航电池包(75kWh)", 800, 720, "台", "FAC-001"),
        ("FP-003", "商用车电池包(200kWh)", 200, 168, "台", "FAC-002"),
        ("FP-004", "储能集装箱电池系统", 80, 62, "台", "FAC-003"),
        ("FP-005", "换电站快换电池包", 350, 290, "台", "FAC-001"),
        ("FP-006", "48V 轻混电池模组", 1200, 1050, "台", "FAC-002"),
        ("FP-007", "电动船舶电池组(500kWh)", 30, 22, "台", "FAC-003"),
        ("FP-008", "两轮车换电电池包(2kWh)", 2000, 1550, "台", "FAC-002"),
    ]
    for fp in final_product_data:
        cur.execute(
            "INSERT INTO final_products VALUES (?, ?, ?, ?, ?, ?)", fp
        )

    # =====================================================
    # 6. 语义链路 (Links) — 错综复杂的依赖关系
    #    4 种关系：supplies, used_in, assembled_into, manufactured_at
    # =====================================================
    link_data = []

    # supplies: Supplier → RawMaterial (每条原材料一个供应关系)
    for rm in raw_material_data:
        link_data.append((rm[0], rm[6], "supplies", "供应"))

    # used_in: RawMaterial → Component （制造真实的物料清单）
    # NCM811 电芯需要的材料：碳酸锂、钴粉、NCM前驱体、镍粉、铝箔、铜箔
    links_rm_to_cmp = [
        ("RM-001", "CMP-001", "used_in", "生产用料"),   # 钴粉 → NCM811 电芯
        ("RM-002", "CMP-001", "used_in", "生产用料"),   # 碳酸锂 → NCM811 电芯
        ("RM-004", "CMP-001", "used_in", "生产用料"),   # NCM前驱体 → NCM811 电芯
        ("RM-009", "CMP-001", "used_in", "生产用料"),   # 镍粉 → NCM811 电芯
        ("RM-011", "CMP-001", "used_in", "生产用料"),   # 铝箔 → NCM811 电芯
        ("RM-012", "CMP-001", "used_in", "生产用料"),   # 铜箔 → NCM811 电芯

        # 磷酸铁锂电芯需要的材料
        ("RM-002", "CMP-002", "used_in", "生产用料"),   # 碳酸锂 → LFP电芯
        ("RM-005", "CMP-002", "used_in", "生产用料"),   # 石墨 → LFP电芯
        ("RM-007", "CMP-002", "used_in", "生产用料"),   # 氧化锰 → LFP电芯
        ("RM-011", "CMP-002", "used_in", "生产用料"),   # 铝箔 → LFP电芯
        ("RM-012", "CMP-002", "used_in", "生产用料"),   # 铜箔 → LFP电芯

        # BMS 主控板材料
        ("RM-003", "CMP-003", "used_in", "生产用料"),   # 电解液 → BMS（间接）
        ("RM-013", "CMP-003", "used_in", "生产用料"),   # PVDF → BMS 粘结剂

        # 极片材料
        ("RM-008", "CMP-011", "used_in", "生产用料"),   # 氢氧化锂 → 正极极片
        ("RM-004", "CMP-011", "used_in", "生产用料"),   # NCM前驱体 → 正极极片
        ("RM-005", "CMP-012", "used_in", "生产用料"),   # 石墨 → 负极极片
        ("RM-014", "CMP-011", "used_in", "生产用料"),   # 导电炭黑 → 正极极片
        ("RM-014", "CMP-012", "used_in", "生产用料"),   # 导电炭黑 → 负极极片

        # 液冷板
        ("RM-011", "CMP-005", "used_in", "生产用料"),   # 铝箔 → 液冷板
        ("RM-009", "CMP-005", "used_in", "生产用料"),   # 镍粉 → 液冷板合金

        # 电池包密封垫圈
        ("RM-013", "CMP-009", "used_in", "生产用料"),   # PVDF → 密封垫圈
        ("RM-006", "CMP-009", "used_in", "生产用料"),   # NMP → 密封垫圈

        # 模组外壳
        ("RM-011", "CMP-004", "used_in", "生产用料"),   # 铝箔 → 模组外壳
        ("RM-009", "CMP-004", "used_in", "生产用料"),   # 镍粉 → 模组外壳

        # 其他
        ("RM-006", "CMP-008", "used_in", "生产用料"),   # NMP → FPC线束
        ("RM-003", "CMP-010", "used_in", "生产用料"),   # 电解液 → 温控传感器
        ("RM-010", "CMP-007", "used_in", "生产用料"),   # 硫酸钴 → 熔断保护器

        # 新增原材料 → 零部件
        ("RM-015", "CMP-001", "used_in", "生产用料"),   # 氧化钴 → NCM811电芯
        ("RM-015", "CMP-011", "used_in", "生产用料"),   # 氧化钴 → 正极极片
        ("RM-016", "CMP-002", "used_in", "生产用料"),   # 钛酸锂 → LFP电芯
        ("RM-017", "CMP-001", "used_in", "生产用料"),   # 隔膜 → NCM811电芯
        ("RM-017", "CMP-002", "used_in", "生产用料"),   # 隔膜 → LFP电芯
        ("RM-003", "CMP-013", "used_in", "生产用料"),   # 电解液 → 注入模块
        ("RM-013", "CMP-013", "used_in", "生产用料"),   # PVDF → 注入模块
        ("RM-011", "CMP-014", "used_in", "生产用料"),   # 铝箔 → 结构框架
        ("RM-009", "CMP-014", "used_in", "生产用料"),   # 镍粉 → 结构框架
    ]
    link_data.extend(links_rm_to_cmp)

    # assembled_into: Component → FinalProduct
    # 长续航电池包 (FP-001)：NCM811电芯、BMS、模组外壳、液冷板、高压连接器、熔断器、FPC线束、密封垫圈、温控传感器、正极极片、负极极片
    essential_cmps = [
        "CMP-001", "CMP-003", "CMP-004", "CMP-005", "CMP-006",
        "CMP-007", "CMP-008", "CMP-009", "CMP-010", "CMP-011", "CMP-012",
    ]
    for cid in essential_cmps:
        link_data.append((cid, "FP-001", "assembled_into", "总装构成"))

    # 标准续航电池包 (FP-002)：磷酸铁锂电芯为主
    fp2_cmps = ["CMP-002", "CMP-003", "CMP-004", "CMP-005", "CMP-006",
                "CMP-007", "CMP-008", "CMP-009", "CMP-010", "CMP-012"]
    for cid in fp2_cmps:
        link_data.append((cid, "FP-002", "assembled_into", "总装构成"))

    # 商用车电池包 (FP-003)
    fp3_cmps = ["CMP-001", "CMP-003", "CMP-004", "CMP-005", "CMP-006",
                "CMP-007", "CMP-008", "CMP-009"]
    for cid in fp3_cmps:
        link_data.append((cid, "FP-003", "assembled_into", "总装构成"))

    # 储能集装箱 (FP-004)
    fp4_cmps = ["CMP-002", "CMP-003", "CMP-005", "CMP-006", "CMP-007",
                "CMP-008", "CMP-009", "CMP-010"]
    for cid in fp4_cmps:
        link_data.append((cid, "FP-004", "assembled_into", "总装构成"))

    # 换电站电池包 (FP-005)
    fp5_cmps = ["CMP-001", "CMP-003", "CMP-004", "CMP-006",
                "CMP-007", "CMP-008", "CMP-009", "CMP-011"]
    for cid in fp5_cmps:
        link_data.append((cid, "FP-005", "assembled_into", "总装构成"))

    # 48V 轻混模组 (FP-006)
    fp6_cmps = ["CMP-002", "CMP-004", "CMP-006", "CMP-007", "CMP-008", "CMP-009"]
    for cid in fp6_cmps:
        link_data.append((cid, "FP-006", "assembled_into", "总装构成"))

    # 电动船舶电池组 (FP-007)
    fp7_cmps = ["CMP-001", "CMP-003", "CMP-004", "CMP-005", "CMP-006",
                "CMP-007", "CMP-008", "CMP-009", "CMP-010", "CMP-011"]
    for cid in fp7_cmps:
        link_data.append((cid, "FP-007", "assembled_into", "总装构成"))

    # 新增零部件 → 最终产品
    extra_assembled = [
        ("CMP-013", "FP-001", "assembled_into", "总装构成"),
        ("CMP-013", "FP-003", "assembled_into", "总装构成"),
        ("CMP-014", "FP-001", "assembled_into", "总装构成"),
        ("CMP-014", "FP-002", "assembled_into", "总装构成"),
        ("CMP-014", "FP-003", "assembled_into", "总装构成"),
        ("CMP-014", "FP-004", "assembled_into", "总装构成"),
        ("CMP-002", "FP-008", "assembled_into", "总装构成"),
        ("CMP-004", "FP-008", "assembled_into", "总装构成"),
        ("CMP-006", "FP-008", "assembled_into", "总装构成"),
        ("CMP-007", "FP-008", "assembled_into", "总装构成"),
        ("CMP-008", "FP-008", "assembled_into", "总装构成"),
        ("CMP-009", "FP-008", "assembled_into", "总装构成"),
    ]
    link_data.extend(extra_assembled)

    # manufactured_at: FinalProduct → Factory
    manufactured_at_data = [
        ("FP-001", "FAC-001", "manufactured_at", "生产于"),
        ("FP-002", "FAC-001", "manufactured_at", "生产于"),
        ("FP-003", "FAC-002", "manufactured_at", "生产于"),
        ("FP-004", "FAC-003", "manufactured_at", "生产于"),
        ("FP-005", "FAC-001", "manufactured_at", "生产于"),
        ("FP-006", "FAC-002", "manufactured_at", "生产于"),
        ("FP-007", "FAC-003", "manufactured_at", "生产于"),
        ("FP-008", "FAC-002", "manufactured_at", "生产于"),
    ]
    link_data.extend(manufactured_at_data)

    for src, tgt, ltype, label in link_data:
        cur.execute(
            "INSERT INTO links (source_id, target_id, link_type, label) VALUES (?, ?, ?, ?)",
            (src, tgt, ltype, label),
        )

    conn.commit()
    conn.close()
    print(f"✅ 数据库初始化完成：{len(supplier_data)} 供应商, "
          f"{len(raw_material_data)} 原材料, {len(component_data)} 零部件, "
          f"{len(final_product_data)} 最终产品, {len(factory_data)} 工厂, "
          f"总计 {len(supplier_data) + len(raw_material_data) + len(component_data) + len(final_product_data) + len(factory_data)} 节点, "
          f"{len(link_data)} 条语义链路。")


# =====================================================
# 查询函数
# =====================================================

def fetch_all(table: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(f"SELECT * FROM {table}").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def fetch_all_suppliers():
    return fetch_all("suppliers")


def fetch_all_raw_materials():
    return fetch_all("raw_materials")


def fetch_all_components():
    return fetch_all("components")


def fetch_all_final_products():
    return fetch_all("final_products")


def fetch_all_factories():
    return fetch_all("factories")


def fetch_all_links():
    conn = get_connection()
    rows = conn.execute("SELECT source_id, target_id, link_type, label FROM links").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def fetch_node_by_id(node_id: str) -> dict | None:
    """根据 ID 在所有表中查找实体"""
    tables = {
        "raw_materials": "RawMaterial",
        "components": "Component",
        "final_products": "FinalProduct",
        "suppliers": "Supplier",
        "factories": "Factory",
    }
    for table, obj_type in tables.items():
        conn = get_connection()
        row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (node_id,)).fetchone()
        conn.close()
        if row:
            result = dict(row)
            result["object_type"] = obj_type
            result["type"] = table  # 兼容旧版
            return result
    return None


def fetch_links_for_node(node_id: str) -> tuple[list[dict], list[dict]]:
    """返回该节点的所有出边和入边"""
    conn = get_connection()
    out_rows = conn.execute(
        "SELECT * FROM links WHERE source_id = ?", (node_id,)
    ).fetchall()
    in_rows = conn.execute(
        "SELECT * FROM links WHERE target_id = ?", (node_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in out_rows], [dict(r) for r in in_rows]


def update_raw_material_stock(material_id: str, new_stock: float) -> dict | None:
    conn = get_connection()
    conn.execute(
        "UPDATE raw_materials SET stock = ? WHERE id = ?", (new_stock, material_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM raw_materials WHERE id = ?", (material_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_component_stock(component_id: str, new_stock: int) -> dict | None:
    conn = get_connection()
    conn.execute(
        "UPDATE components SET stock = ? WHERE id = ?", (new_stock, component_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM components WHERE id = ?", (component_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_raw_material_by_id(material_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM raw_materials WHERE id = ?", (material_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_supplier_for_material(material_id: str) -> dict | None:
    conn = get_connection()
    mat = conn.execute("SELECT supplier_id FROM raw_materials WHERE id = ?", (material_id,)).fetchone()
    if not mat:
        conn.close()
        return None
    row = conn.execute("SELECT * FROM suppliers WHERE id = ?", (mat["supplier_id"],)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_downstream_components_for_material(material_id: str) -> list[dict]:
    """获取某个原材料所流向的所有零部件"""
    conn = get_connection()
    rows = conn.execute("""
        SELECT c.* FROM components c
        INNER JOIN links l ON l.target_id = c.id AND l.link_type = 'used_in'
        WHERE l.source_id = ?
    """, (material_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_downstream_products_for_component(component_id: str) -> list[dict]:
    """获取某个零部件所装配的所有最终产品"""
    conn = get_connection()
    rows = conn.execute("""
        SELECT fp.* FROM final_products fp
        INNER JOIN links l ON l.target_id = fp.id AND l.link_type = 'assembled_into'
        WHERE l.source_id = ?
    """, (component_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_upstream_materials_for_product(product_id: str) -> list[dict]:
    """获取某个最终产品的所有上游原材料（爆炸半径分析）"""
    conn = get_connection()
    rows = conn.execute("""
        SELECT DISTINCT rm.* FROM raw_materials rm
        INNER JOIN links l1 ON l1.target_id = rm.id AND l1.link_type = 'used_in'
        INNER JOIN links l2 ON l2.source_id = l1.source_id AND l2.link_type = 'assembled_into'
        WHERE l2.target_id = ?
    """, (product_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# =====================================================
# 本体 Schema 约束系统 (Phase 8)
# =====================================================

def init_ontology_schema_table():
    """初始化本体 Schema 约束表"""
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ontology_constraints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_name TEXT NOT NULL,
            constraint_type TEXT NOT NULL,
            property_name TEXT,
            rule TEXT NOT NULL,
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


def get_constraints(class_name: str = None) -> list[dict]:
    """获取约束规则"""
    conn = get_connection()
    if class_name:
        rows = conn.execute(
            "SELECT * FROM ontology_constraints WHERE class_name = ?", (class_name,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM ontology_constraints").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_constraint(class_name: str, constraint_type: str, property_name: str, rule: str, message: str = ""):
    """添加约束"""
    conn = get_connection()
    conn.execute(
        "INSERT INTO ontology_constraints (class_name, constraint_type, property_name, rule, message) VALUES (?,?,?,?,?)",
        (class_name, constraint_type, property_name, rule, message)
    )
    conn.commit()
    conn.close()


def delete_constraint(constraint_id: int):
    """删除约束"""
    conn = get_connection()
    conn.execute("DELETE FROM ontology_constraints WHERE id = ?", (constraint_id,))
    conn.commit()
    conn.close()
