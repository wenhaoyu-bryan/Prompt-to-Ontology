#!/usr/bin/env python3
"""
演示数据集生成器 — 工业智能体本体系统 Phase 4
生成 6 个 SAP 风格的 CSV 文件，覆盖场景 C (危机基线) + 场景 D (扩展导入)。

运行方式: python docs/sample-data/generate_demo_csv.py
输出目录: docs/sample-data/
"""

import csv
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__))


# =====================================================================
# 场景 C — 基线危机数据 (先通过 Neo4j 种子/迁移写入)
# 场景 D — 扩展数据 (通过 CSV 导入管道，含 ⚡ 标记)
# =====================================================================

# ──────────────────────────────────────────────
# 供应商 (Suppliers)
# ──────────────────────────────────────────────
SUPPLIERS = [
    # === 场景 C: 基线 (14家) ===
    # (SAP_ID, 名称, 风险, 准时率, 交期, 支付条款, 国家, 城市, 联系人, 电话, 认证, 合同号, 最近审计)
    ("SUP-301", "刚果金钴业联合体", "High", 0.55, 45, "T/T 30天", "刚果(金)", "卢本巴希",
     "Mr. Kabongo", "+243-1234-5678", "ISO 9001", "PO-2024-0301", "2024-08"),
    ("SUP-302", "天齐锂业澳洲分公司", "Low", 0.94, 21, "LC 60天", "澳大利亚", "珀斯",
     "Ms. Chen", "+61-8-9000-1001", "IATF 16949", "PO-2024-0302", "2025-01"),
    ("SUP-303", "巴斯夫正极材料事业部", "Low", 0.96, 14, "Net 45", "德国", "路德维希港",
     "Dr. Weber", "+49-621-6000-200", "IATF 16949", "PO-2024-0303", "2025-02"),
    ("SUP-304", "华友钴业新材料集团", "Medium", 0.75, 30, "T/T 60天", "中国", "浙江桐乡",
     "张经理", "+86-573-8888-1234", "ISO 14001", "PO-2024-0304", "2024-11"),
    ("SUP-305", "住友金属矿业株式会社", "Medium", 0.82, 28, "LC 45天", "日本", "东京",
     "佐藤部长", "+81-3-5200-3001", "ISO 9001", "PO-2024-0305", "2024-10"),
    ("SUP-306", "赣锋锂业有限公司", "Low", 0.93, 14, "T/T 30天", "中国", "江西新余",
     "王总", "+86-790-6666-8888", "IATF 16949", "PO-2024-0306", "2025-01"),
    ("SUP-307", "金川集团镍钴研究院", "Medium", 0.78, 25, "Net 60", "中国", "甘肃金昌",
     "李院长", "+86-935-8811-2233", "ISO 9001", "PO-2024-0307", "2024-09"),
    ("SUP-308", "淡水河谷镍业加拿大", "High", 0.58, 50, "T/T 30天", "加拿大", "萨德伯里",
     "Mr. Thompson", "+1-705-555-0100", "ISO 14001", "PO-2024-0308", "2024-06"),
    ("SUP-309", "优美科正极材料", "Low", 0.91, 18, "Net 30", "比利时", "布鲁塞尔",
     "Ms. Janssen", "+32-2-700-5000", "IATF 16949", "PO-2024-0309", "2025-03"),
    ("SUP-310", "LG化学上游材料事业部", "Medium", 0.80, 22, "LC 60天", "韩国", "首尔",
     "金部长", "+82-2-2190-8000", "IATF 16949", "PO-2024-0310", "2024-12"),
    ("SUP-311", "三菱化学高功能材料", "Medium", 0.79, 24, "Net 45", "日本", "东京",
     "中村课长", "+81-3-6414-8000", "ISO 9001", "PO-2024-0311", "2024-10"),
    ("SUP-312", "宁德时代上游原料事业部", "Low", 0.95, 10, "内部调拨", "中国", "福建宁德",
     "陈总监", "+86-593-2999-1000", "IATF 16949", "PO-2024-0312", "2025-02"),
    ("SUP-313", "青海盐湖工业股份", "Medium", 0.72, 20, "T/T 30天", "中国", "青海格尔木",
     "刘厂长", "+86-979-8888-6600", "ISO 9001", "PO-2024-0313", "2024-08"),
    ("SUP-314", "智利SQM锂业亚太部", "Low", 0.88, 28, "LC 45天", "智利", "圣地亚哥",
     "Mr. Silva", "+56-2-2900-3000", "IATF 16949", "PO-2024-0314", "2025-01"),
    # === 场景 D: 扩展导入 (CSV 导入演示, 6家) ===
    ("SUP-401", "南非铂族金属材料公司 ⚡", "Low", 0.90, 20, "Net 60", "南非", "约翰内斯堡",
     "Mr. Botha", "+27-11-555-0200", "ISO 9001", "PO-2025-0401", "2025-03"),
    ("SUP-402", "印尼镍矿加工产业园 ⚡", "Low", 0.87, 25, "LC 45天", "印度尼西亚", "苏拉威西",
     "Mr. Wijaya", "+62-21-5000-4000", "ISO 14001", "PO-2025-0402", "2025-04"),
    ("SUP-403", "格陵兰矿产勘探集团 ⚡", "Medium", 0.76, 35, "T/T 30天", "格陵兰", "努克",
     "Ms. Andersen", "+299-3-200-0500", "ISO 9001", "PO-2025-0403", "2025-02"),
    ("SUP-404", "沙特矿业公司化肥事业部 ⚡", "Low", 0.92, 18, "Net 30", "沙特阿拉伯", "利雅得",
     "Mr. Al-Saud", "+966-11-800-1000", "IATF 16949", "PO-2025-0404", "2025-04"),
    ("SUP-405", "芬兰锂矿精炼有限公司 ⚡", "Low", 0.95, 16, "LC 30天", "芬兰", "赫尔辛基",
     "Mr. Virtanen", "+358-9-2500-6000", "IATF 16949", "PO-2025-0405", "2025-05"),
    ("SUP-406", "巴西铌矿工业集团 ⚡", "Medium", 0.81, 28, "T/T 45天", "巴西", "贝洛奥里藏特",
     "Mr. Silva Jr.", "+55-31-3500-7000", "ISO 9001", "PO-2025-0406", "2025-03"),
]

# ──────────────────────────────────────────────
# 原材料 (Raw Materials)
# ──────────────────────────────────────────────
RAW_MATERIALS = [
    # === 场景 C: 基线 (24种) ===
    # (SAP_ID, 名称, 类别, 单位, 库存, 安全线, 日消耗, 交期, 质量分, 不良率, 供应商, 仓库, 最后收货)
    ("RM-301", "高纯钴粉 (Co≥99.9%)", "正极材料", "吨", 2.3, 20.0, 5.5, 45, 0.88, 0.03,
     "SUP-301", "W01-A03", "2025-03-15"),
    ("RM-302", "电池级碳酸锂 (Li₂CO₃)", "正极材料", "吨", 85.0, 40.0, 8.0, 14, 0.95, 0.01,
     "SUP-302", "W01-B01", "2025-04-01"),
    ("RM-303", "六氟磷酸锂 (LiPF₆)", "电解液", "吨", 18.0, 25.0, 4.2, 14, 0.91, 0.02,
     "SUP-303", "W02-A05", "2025-03-20"),
    ("RM-304", "NCM811前驱体 (Ni₀.₈Co₀.₁Mn₀.₁)", "正极材料", "吨", 12.5, 20.0, 6.0, 30, 0.87, 0.04,
     "SUP-304", "W01-A01", "2025-03-10"),
    ("RM-305", "球形石墨 (99.95%)", "负极材料", "吨", 55.0, 30.0, 7.0, 28, 0.93, 0.02,
     "SUP-305", "W03-C02", "2025-04-02"),
    ("RM-306", "N-甲基吡咯烷酮 (NMP)", "辅助材料", "吨", 28.0, 20.0, 3.5, 18, 0.90, 0.01,
     "SUP-309", "W02-B04", "2025-03-28"),
    ("RM-307", "电解液添加剂 (FEC)", "电解液", "吨", 3.8, 8.0, 1.2, 22, 0.86, 0.03,
     "SUP-310", "W02-A06", "2025-03-18"),
    ("RM-308", "高纯氢氧化锂 (LiOH·H₂O)", "正极材料", "吨", 48.0, 25.0, 4.0, 14, 0.96, 0.01,
     "SUP-306", "W01-B02", "2025-04-03"),
    ("RM-309", "镍粉 (99.9%, 3-5μm)", "正极材料", "吨", 22.0, 18.0, 5.0, 25, 0.89, 0.02,
     "SUP-307", "W01-A04", "2025-03-22"),
    ("RM-310", "硫酸钴溶液 (CoSO₄·7H₂O)", "正极材料", "吨", 8.0, 15.0, 3.0, 50, 0.82, 0.05,
     "SUP-308", "W01-A05", "2025-02-28"),
    ("RM-311", "铝箔集流体 (15μm)", "集流体", "吨", 68.0, 40.0, 9.0, 24, 0.94, 0.01,
     "SUP-305", "W04-D01", "2025-04-01"),
    ("RM-312", "铜箔集流体 (8μm)", "集流体", "吨", 52.0, 35.0, 8.5, 24, 0.92, 0.01,
     "SUP-311", "W04-D02", "2025-03-30"),
    ("RM-313", "聚偏氟乙烯 (PVDF-HSV900)", "粘结剂", "吨", 12.0, 15.0, 2.5, 18, 0.88, 0.02,
     "SUP-309", "W02-C01", "2025-03-25"),
    ("RM-314", "导电炭黑 (Super-P Li)", "导电剂", "吨", 24.0, 20.0, 3.0, 14, 0.91, 0.01,
     "SUP-312", "W02-C02", "2025-04-01"),
    ("RM-315", "氧化钴 (Co₃O₄, 电池级)", "正极材料", "吨", 5.0, 18.0, 3.5, 45, 0.83, 0.04,
     "SUP-301", "W01-A06", "2025-03-05"),
    ("RM-316", "钛酸锂 (Li₂TiO₃)", "负极材料", "吨", 32.0, 25.0, 4.0, 28, 0.94, 0.01,
     "SUP-313", "W03-C03", "2025-03-29"),
    ("RM-317", "聚丙烯隔膜 (12μm)", "隔膜", "吨", 48.0, 30.0, 7.5, 24, 0.92, 0.02,
     "SUP-305", "W03-A01", "2025-04-02"),
    ("RM-318", "氧化锰 (MnO₂, 60%)", "正极材料", "吨", 42.0, 35.0, 5.0, 20, 0.85, 0.03,
     "SUP-304", "W01-A07", "2025-03-20"),
    ("RM-319", "SBR丁苯橡胶粘结剂", "粘结剂", "吨", 8.5, 12.0, 1.8, 22, 0.87, 0.02,
     "SUP-310", "W02-C03", "2025-03-15"),
    ("RM-320", "CMC羧甲基纤维素钠", "粘结剂", "吨", 15.0, 10.0, 1.5, 20, 0.90, 0.01,
     "SUP-312", "W02-C04", "2025-04-01"),
    ("RM-321", "铝塑膜 (锂电封装用)", "封装材料", "吨", 22.0, 15.0, 3.0, 28, 0.88, 0.02,
     "SUP-311", "W04-E01", "2025-03-28"),
    ("RM-322", "电解液溶剂 (EC/EMC 混合)", "电解液", "吨", 35.0, 25.0, 4.5, 18, 0.92, 0.01,
     "SUP-303", "W02-A07", "2025-04-01"),
    ("RM-323", "磷酸铁锂 (LiFePO₄)", "正极材料", "吨", 62.0, 35.0, 7.0, 21, 0.95, 0.01,
     "SUP-302", "W01-B03", "2025-04-02"),
    ("RM-324", "碳纳米管 (CNT 导电浆料)", "导电剂", "吨", 16.0, 12.0, 2.0, 28, 0.91, 0.02,
     "SUP-309", "W02-C05", "2025-03-28"),
    # === 场景 D: 扩展导入 (7种) ===
    ("RM-401", "高纯锰粉 (Mn≥99.95%) ⚡", "正极材料", "吨", 30.0, 15.0, 3.0, 20, 0.94, 0.01,
     "SUP-401", "W01-B05", "2025-04-10"),
    ("RM-402", "镍钴氢氧化物 (Ni₀.₆Co₀.₂Mn₀.₂) ⚡", "正极材料", "吨", 0.0, 18.0, 4.0, 25, 0.90, 0.02,
     "SUP-402", "W01-A08", "2025-04-12"),
    ("RM-403", "铌掺杂钛酸锂 (LNO) ⚡", "负极材料", "吨", 18.0, 12.0, 1.5, 35, 0.93, 0.01,
     "SUP-406", "W03-C05", "2025-04-08"),
    ("RM-404", "低温电解液配方 (LCE-1) ⚡", "电解液", "吨", 25.0, 12.0, 2.0, 18, 0.96, 0.01,
     "SUP-404", "W02-A08", "2025-04-15"),
    ("RM-405", "单壁碳纳米管 (SWCNT) ⚡", "导电剂", "吨", 10.0, 8.0, 1.0, 20, 0.95, 0.01,
     "SUP-401", "W02-C06", "2025-04-12"),
    ("RM-406", "固态电解质材料 (LLZO) ⚡", "电解质", "吨", 5.0, 10.0, 1.0, 30, 0.88, 0.03,
     "SUP-405", "W02-A09", "2025-04-05"),
    ("RM-407", "石墨烯导电浆料 (GNP-5%) ⚡", "导电剂", "吨", 15.0, 10.0, 1.5, 16, 0.97, 0.01,
     "SUP-404", "W02-C07", "2025-04-14"),
    ("RM-408", "回收钴粉 (再生材料) ⚡", "正极材料", "吨", 0.0, 8.0, 1.0, 28, 0.80, 0.06,
     "SUP-403", "W01-A09", "2025-04-01"),
]

# ──────────────────────────────────────────────
# 核心零部件 (Components)
# ──────────────────────────────────────────────
COMPONENTS = [
    # === 场景 C: 基线 (18种) ===
    # (SAP_ID, 名称, 类型, 库存, 安全库存, 每产品用量, 单位, 日用量, 不良率, 交期, WIP)
    ("CMP-301", "NCM811 电芯单体 (280Ah)", "方形铝壳", 4500, 8000, 96, "件", 800, 0.02, 7, 1200),
    ("CMP-302", "LFP 电芯单体 (302Ah)", "方形铝壳", 6200, 6000, 96, "件", 600, 0.01, 5, 1500),
    ("CMP-303", "BMS 主控板 v4.0", "电子", 820, 1500, 1, "件", 150, 0.03, 14, 200),
    ("CMP-304", "电池模组铝合金外壳", "结构件", 2100, 3000, 1, "件", 350, 0.01, 10, 500),
    ("CMP-305", "液冷板总成 (铜铝复合)", "热管理", 480, 1200, 1, "件", 200, 0.04, 15, 150),
    ("CMP-306", "高压连接器 (800V)", "电气", 3400, 4000, 2, "件", 500, 0.02, 10, 800),
    ("CMP-307", "熔断保护器 (500V/400A)", "电气", 5600, 6000, 1, "件", 700, 0.01, 7, 1200),
    ("CMP-308", "电压采集 FPC 线束", "电子", 7200, 8000, 1, "件", 900, 0.02, 5, 2000),
    ("CMP-309", "电池包密封垫圈 (硅胶)", "密封件", 8900, 9000, 2, "件", 1100, 0.01, 3, 3000),
    ("CMP-310", "温控传感器模组 (NTC)", "电子", 1500, 2500, 4, "件", 250, 0.03, 12, 400),
    ("CMP-311", "正极极片 (NCM811, 预锂化)", "极片", 3200, 5000, 96, "件", 450, 0.02, 7, 1000),
    ("CMP-312", "负极极片 (石墨/硅氧复合)", "极片", 4800, 6000, 96, "件", 500, 0.01, 7, 1200),
    ("CMP-313", "电解液注入模块 (精密泵)", "生产设备", 2, 5, 1, "件", 0, 0.01, 30, 0),
    ("CMP-314", "电池包结构框架 (钢制)", "结构件", 980, 2000, 1, "件", 180, 0.01, 15, 200),
    ("CMP-315", "热失控传感器 (气体/VOC)", "电子", 2800, 3000, 2, "件", 350, 0.02, 10, 600),
    ("CMP-316", "高压继电器 (800V/250A)", "电气", 1800, 2500, 1, "件", 300, 0.02, 12, 400),
    ("CMP-317", "电池包底部护板 (钛合金)", "结构件", 600, 1500, 1, "件", 120, 0.01, 20, 100),
    ("CMP-318", "汇流排 (Busbar, 铜镀镍)", "电气", 4500, 5000, 8, "件", 600, 0.01, 5, 1500),
    # === 场景 D: 扩展导入 (5种) ===
    ("CMP-401", "固态电芯原型 (ASSB-1) ⚡", "固态电池", 200, 500, 48, "件", 30, 0.05, 30, 50),
    ("CMP-402", "低温启动加热膜 (PTC) ⚡", "热管理", 1500, 1000, 1, "件", 100, 0.02, 15, 300),
    ("CMP-403", "钠离子电芯单体 (26700) ⚡", "圆柱", 5000, 3000, 48, "件", 400, 0.03, 10, 800),
    ("CMP-404", "智能BMS 从控板 v5.0 ⚡", "电子", 400, 800, 1, "件", 80, 0.02, 18, 100),
    ("CMP-405", "无线BMS通信模组 ⚡", "电子", 800, 600, 1, "件", 60, 0.01, 14, 150),
    ("CMP-406", "CNT复合导热垫片 ⚡", "热管理", 2000, 1500, 2, "件", 200, 0.01, 10, 500),
]

# ──────────────────────────────────────────────
# 生产基地 (Factories)
# ──────────────────────────────────────────────
FACTORIES = [
    # === 场景 C: 基线 (7座) ===
    # (SAP_ID, 名称, 类型, 国家, 城市, 状态, 产能利用率, 员工数, 面积㎡, 投产年份, 产线数)
    ("FAC-301", "宁德超级工厂一期", "电芯生产", "中国", "福建宁德", "Running", 0.85, 3200, 180000, 2020, 12),
    ("FAC-302", "常州溧阳制造基地", "总装", "中国", "江苏常州", "Running", 0.78, 1800, 120000, 2019, 8),
    ("FAC-303", "合肥新能源总装厂", "总装", "中国", "安徽合肥", "Running", 0.62, 1500, 90000, 2021, 6),
    ("FAC-304", "武汉电池回收再生中心", "再生", "中国", "湖北武汉", "Running", 0.55, 600, 45000, 2022, 4),
    ("FAC-305", "深圳研发试产线", "研发", "中国", "广东深圳", "Maintenance", 0.15, 200, 12000, 2023, 2),
    ("FAC-306", "重庆两江新区制造基地", "电芯+总装", "中国", "重庆", "Running", 0.72, 2100, 150000, 2021, 10),
    ("FAC-307", "匈牙利德布勒森海外工厂", "电芯+总装", "匈牙利", "德布勒森", "Running", 0.88, 2800, 200000, 2024, 14),
    # === 场景 D: 扩展导入 (2座) ===
    ("FAC-401", "印尼雅加达电池产业园 ⚡", "电芯生产", "印度尼西亚", "雅加达", "Running", 0.65, 1200, 100000, 2025, 6),
    ("FAC-402", "墨西哥蒙特雷北美工厂 ⚡", "总装", "墨西哥", "蒙特雷", "Running", 0.70, 800, 80000, 2025, 4),
]

# ──────────────────────────────────────────────
# 最终产品 (Final Products)
# ──────────────────────────────────────────────
FINAL_PRODUCTS = [
    # === 场景 C: 基线 (10种) ===
    # (SAP_ID, 名称, 品类, 月目标产量, 月实际产量, 达标率%, 单位, 工厂, BOM层级, 均价USD)
    ("FP-301", "长续航电池包 100kWh (NCM811)", "乘用车", 500, 385, 77.0, "台", "FAC-301", 3, 12000),
    ("FP-302", "标准续航电池包 75kWh (LFP)", "乘用车", 800, 720, 90.0, "台", "FAC-301", 3, 8500),
    ("FP-303", "商用车电池包 200kWh", "商用车", 200, 168, 84.0, "台", "FAC-302", 3, 24000),
    ("FP-304", "储能集装箱系统 1MWh", "储能", 80, 62, 77.5, "台", "FAC-303", 4, 80000),
    ("FP-305", "换电站快换电池包 80kWh", "换电", 350, 290, 82.9, "台", "FAC-301", 3, 9500),
    ("FP-306", "48V 轻混电池模组 500Wh", "轻混", 1200, 1050, 87.5, "台", "FAC-302", 2, 1200),
    ("FP-307", "电动船舶电池组 500kWh", "船舶", 30, 22, 73.3, "台", "FAC-303", 4, 55000),
    ("FP-308", "两轮车换电电池包 2kWh", "两轮", 2000, 1550, 77.5, "台", "FAC-302", 2, 350),
    ("FP-309", "数据中心备电模组 100kWh", "备电", 150, 135, 90.0, "台", "FAC-306", 3, 15000),
    ("FP-310", "电动工程机械电池 300kWh", "工程", 60, 48, 80.0, "台", "FAC-306", 3, 36000),
    # === 场景 D: 扩展导入 (4种) ===
    ("FP-401", "半固态电池包 120kWh ⚡", "乘用车高端", 100, 55, 55.0, "台", "FAC-401", 3, 18000),
    ("FP-402", "钠离子储能系统 200kWh ⚡", "储能", 150, 100, 66.7, "台", "FAC-402", 3, 12000),
    ("FP-403", "低温极寒电池包 60kWh ⚡", "特种车辆", 50, 42, 84.0, "台", "FAC-402", 3, 16000),
    ("FP-404", "家用储能一体机 15kWh ⚡", "户用储能", 500, 420, 84.0, "台", "FAC-401", 2, 2800),
]

# ──────────────────────────────────────────────
# 语义链路 (Links)
# ──────────────────────────────────────────────
def build_links():
    """动态构建所有链路关系"""
    links = []

    # --- supplies: Supplier → RawMaterial ---
    supplier_map = {}
    for rm in RAW_MATERIALS:
        sid = rm[0]
        sup = rm[9]
        if sup not in supplier_map:
            supplier_map[sup] = []
        supplier_map[sup].append(sid)

    for sup_id, materials in supplier_map.items():
        for mat_id in materials:
            links.append((mat_id, sup_id, "supplies", "供应"))

    # --- used_in: RawMaterial → Component ---
    # NCM811 电芯 (CMP-301) 需要的材料
    ncm811_mats = ["RM-301", "RM-302", "RM-304", "RM-309", "RM-311", "RM-312",
                   "RM-315", "RM-317", "RM-313", "RM-314", "RM-324"]
    for mid in ncm811_mats:
        links.append((mid, "CMP-301", "used_in", "生产用料"))
    # LFP 电芯 (CMP-302)
    lfp_mats = ["RM-302", "RM-305", "RM-318", "RM-311", "RM-312", "RM-323", "RM-317"]
    for mid in lfp_mats:
        links.append((mid, "CMP-302", "used_in", "生产用料"))
    # BMS 主控板 (CMP-303)
    links.append(("RM-306", "CMP-303", "used_in", "生产用料"))
    links.append(("RM-313", "CMP-303", "used_in", "生产用料"))
    # 液冷板 (CMP-305)
    links.append(("RM-311", "CMP-305", "used_in", "生产用料"))
    links.append(("RM-309", "CMP-305", "used_in", "生产用料"))
    # 正极极片 (CMP-311)
    links.append(("RM-308", "CMP-311", "used_in", "生产用料"))
    links.append(("RM-304", "CMP-311", "used_in", "生产用料"))
    links.append(("RM-314", "CMP-311", "used_in", "生产用料"))
    links.append(("RM-324", "CMP-311", "used_in", "生产用料"))
    # 负极极片 (CMP-312)
    links.append(("RM-305", "CMP-312", "used_in", "生产用料"))
    links.append(("RM-314", "CMP-312", "used_in", "生产用料"))
    links.append(("RM-320", "CMP-312", "used_in", "生产用料"))
    links.append(("RM-319", "CMP-312", "used_in", "生产用料"))
    links.append(("RM-316", "CMP-312", "used_in", "生产用料"))
    # 模组外壳 (CMP-304)
    links.append(("RM-311", "CMP-304", "used_in", "生产用料"))
    links.append(("RM-309", "CMP-304", "used_in", "生产用料"))
    # 密封垫圈 (CMP-309)
    links.append(("RM-313", "CMP-309", "used_in", "生产用料"))
    links.append(("RM-306", "CMP-309", "used_in", "生产用料"))
    # FPC 线束 (CMP-308)
    links.append(("RM-306", "CMP-308", "used_in", "生产用料"))
    # 温控传感器 (CMP-310)
    links.append(("RM-303", "CMP-310", "used_in", "生产用料"))
    links.append(("RM-307", "CMP-310", "used_in", "生产用料"))
    # 熔断保护器 (CMP-307)
    links.append(("RM-310", "CMP-307", "used_in", "生产用料"))
    # 高压连接器 (CMP-306)
    links.append(("RM-312", "CMP-306", "used_in", "生产用料"))
    links.append(("RM-321", "CMP-306", "used_in", "生产用料"))
    # 结构框架 (CMP-314)
    links.append(("RM-311", "CMP-314", "used_in", "生产用料"))
    links.append(("RM-309", "CMP-314", "used_in", "生产用料"))
    # 电解液注入模块 (CMP-313)
    links.append(("RM-303", "CMP-313", "used_in", "生产用料"))
    links.append(("RM-322", "CMP-313", "used_in", "生产用料"))
    links.append(("RM-313", "CMP-313", "used_in", "生产用料"))
    # 热失控传感器 (CMP-315)
    links.append(("RM-303", "CMP-315", "used_in", "生产用料"))
    links.append(("RM-307", "CMP-315", "used_in", "生产用料"))
    # 高压继电器 (CMP-316)
    links.append(("RM-310", "CMP-316", "used_in", "生产用料"))
    # 汇流排 (CMP-318)
    links.append(("RM-312", "CMP-318", "used_in", "生产用料"))
    links.append(("RM-311", "CMP-318", "used_in", "生产用料"))
    # 底部护板 (CMP-317)
    links.append(("RM-311", "CMP-317", "used_in", "生产用料"))
    links.append(("RM-316", "CMP-317", "used_in", "生产用料"))
    # 场景D: 扩展原材料 → 扩展零部件
    # 固态电芯 (CMP-401)
    links.append(("RM-401", "CMP-401", "used_in", "生产用料"))
    links.append(("RM-406", "CMP-401", "used_in", "生产用料"))
    links.append(("RM-405", "CMP-401", "used_in", "生产用料"))
    # 低温加热膜 (CMP-402)
    links.append(("RM-404", "CMP-402", "used_in", "生产用料"))
    links.append(("RM-407", "CMP-402", "used_in", "生产用料"))
    # 钠离子电芯 (CMP-403)
    links.append(("RM-401", "CMP-403", "used_in", "生产用料"))
    links.append(("RM-323", "CMP-403", "used_in", "生产用料"))
    links.append(("RM-317", "CMP-403", "used_in", "生产用料"))
    # 智能BMS (CMP-404)
    links.append(("RM-306", "CMP-404", "used_in", "生产用料"))
    # 无线BMS模组 (CMP-405)
    links.append(("RM-306", "CMP-405", "used_in", "生产用料"))
    links.append(("RM-313", "CMP-405", "used_in", "生产用料"))
    # CNT导热垫片 (CMP-406)
    links.append(("RM-405", "CMP-406", "used_in", "生产用料"))
    links.append(("RM-407", "CMP-406", "used_in", "生产用料"))
    # 扩展材料补充到现有零部件
    links.append(("RM-403", "CMP-301", "used_in", "生产用料"))
    links.append(("RM-402", "CMP-301", "used_in", "生产用料"))
    links.append(("RM-408", "CMP-301", "used_in", "生产用料"))
    links.append(("RM-403", "CMP-312", "used_in", "生产用料"))
    links.append(("RM-404", "CMP-310", "used_in", "生产用料"))
    links.append(("RM-407", "CMP-311", "used_in", "生产用料"))

    # --- assembled_into: Component → FinalProduct ---
    # FP-301 长续航电池包 (NCM811)
    fp301_cmps = ["CMP-301", "CMP-303", "CMP-304", "CMP-305", "CMP-306", "CMP-307",
                  "CMP-308", "CMP-309", "CMP-310", "CMP-311", "CMP-312", "CMP-314",
                  "CMP-315", "CMP-316", "CMP-317", "CMP-318"]
    for cid in fp301_cmps:
        links.append((cid, "FP-301", "assembled_into", "总装构成"))
    # FP-302 标准续航 (LFP)
    fp302_cmps = ["CMP-302", "CMP-303", "CMP-304", "CMP-305", "CMP-306", "CMP-307",
                  "CMP-308", "CMP-309", "CMP-310", "CMP-312", "CMP-314", "CMP-318"]
    for cid in fp302_cmps:
        links.append((cid, "FP-302", "assembled_into", "总装构成"))
    # FP-303 商用车
    fp303_cmps = ["CMP-301", "CMP-303", "CMP-304", "CMP-305", "CMP-306", "CMP-307",
                  "CMP-308", "CMP-309", "CMP-314", "CMP-316", "CMP-317", "CMP-318"]
    for cid in fp303_cmps:
        links.append((cid, "FP-303", "assembled_into", "总装构成"))
    # FP-304 储能
    fp304_cmps = ["CMP-302", "CMP-303", "CMP-305", "CMP-306", "CMP-307", "CMP-308",
                  "CMP-309", "CMP-310", "CMP-314", "CMP-315"]
    for cid in fp304_cmps:
        links.append((cid, "FP-304", "assembled_into", "总装构成"))
    # FP-305 换电站
    fp305_cmps = ["CMP-301", "CMP-303", "CMP-304", "CMP-306", "CMP-307", "CMP-308",
                  "CMP-309", "CMP-311", "CMP-314", "CMP-316", "CMP-318"]
    for cid in fp305_cmps:
        links.append((cid, "FP-305", "assembled_into", "总装构成"))
    # FP-306 48V轻混
    fp306_cmps = ["CMP-302", "CMP-304", "CMP-306", "CMP-307", "CMP-308", "CMP-309",
                  "CMP-318"]
    for cid in fp306_cmps:
        links.append((cid, "FP-306", "assembled_into", "总装构成"))
    # FP-307 船舶
    fp307_cmps = ["CMP-301", "CMP-303", "CMP-304", "CMP-305", "CMP-306", "CMP-307",
                  "CMP-308", "CMP-309", "CMP-310", "CMP-311", "CMP-314", "CMP-315", "CMP-316"]
    for cid in fp307_cmps:
        links.append((cid, "FP-307", "assembled_into", "总装构成"))
    # FP-308 两轮车
    fp308_cmps = ["CMP-302", "CMP-304", "CMP-306", "CMP-307", "CMP-308", "CMP-309", "CMP-318"]
    for cid in fp308_cmps:
        links.append((cid, "FP-308", "assembled_into", "总装构成"))
    # FP-309 数据中心备电
    fp309_cmps = ["CMP-302", "CMP-303", "CMP-306", "CMP-307", "CMP-308", "CMP-309",
                  "CMP-314", "CMP-315"]
    for cid in fp309_cmps:
        links.append((cid, "FP-309", "assembled_into", "总装构成"))
    # FP-310 工程机械
    fp310_cmps = ["CMP-301", "CMP-303", "CMP-304", "CMP-306", "CMP-307", "CMP-308",
                  "CMP-309", "CMP-314", "CMP-316", "CMP-317"]
    for cid in fp310_cmps:
        links.append((cid, "FP-310", "assembled_into", "总装构成"))
    # 场景D: 扩展零部件 → 扩展产品
    fp401_cmps = ["CMP-401", "CMP-404", "CMP-405", "CMP-304", "CMP-306", "CMP-307",
                  "CMP-308", "CMP-309"]
    for cid in fp401_cmps:
        links.append((cid, "FP-401", "assembled_into", "总装构成"))
    fp402_cmps = ["CMP-403", "CMP-303", "CMP-304", "CMP-306", "CMP-307", "CMP-308",
                  "CMP-309", "CMP-406"]
    for cid in fp402_cmps:
        links.append((cid, "FP-402", "assembled_into", "总装构成"))
    fp403_cmps = ["CMP-402", "CMP-301", "CMP-303", "CMP-306", "CMP-307", "CMP-308",
                  "CMP-309", "CMP-310", "CMP-314", "CMP-315"]
    for cid in fp403_cmps:
        links.append((cid, "FP-403", "assembled_into", "总装构成"))
    fp404_cmps = ["CMP-302", "CMP-303", "CMP-306", "CMP-307", "CMP-308", "CMP-309",
                  "CMP-406", "CMP-318"]
    for cid in fp404_cmps:
        links.append((cid, "FP-404", "assembled_into", "总装构成"))
    # 扩展零部件补充到现有产品
    for cid in ["CMP-402", "CMP-404", "CMP-405", "CMP-406"]:
        links.append((cid, "FP-301", "assembled_into", "总装构成"))
    links.append(("CMP-406", "FP-302", "assembled_into", "总装构成"))
    links.append(("CMP-402", "FP-303", "assembled_into", "总装构成"))

    # --- manufactured_at: FinalProduct → Factory ---
    fp_factory = [
        ("FP-301", "FAC-301", "manufactured_at", "生产于"),
        ("FP-302", "FAC-301", "manufactured_at", "生产于"),
        ("FP-303", "FAC-302", "manufactured_at", "生产于"),
        ("FP-304", "FAC-303", "manufactured_at", "生产于"),
        ("FP-305", "FAC-301", "manufactured_at", "生产于"),
        ("FP-306", "FAC-302", "manufactured_at", "生产于"),
        ("FP-307", "FAC-303", "manufactured_at", "生产于"),
        ("FP-308", "FAC-302", "manufactured_at", "生产于"),
        ("FP-309", "FAC-306", "manufactured_at", "生产于"),
        ("FP-310", "FAC-306", "manufactured_at", "生产于"),
        ("FP-401", "FAC-401", "manufactured_at", "生产于"),
        ("FP-402", "FAC-402", "manufactured_at", "生产于"),
        ("FP-403", "FAC-402", "manufactured_at", "生产于"),
        ("FP-404", "FAC-401", "manufactured_at", "生产于"),
    ]
    for fp_id, fac_id, rel, lbl in fp_factory:
        links.append((fp_id, fac_id, rel, lbl))

    return links


# =====================================================================
# CSV 写入函数
# =====================================================================

def write_suppliers_csv():
    path = os.path.join(OUTPUT_DIR, "suppliers_demo.csv")
    headers = ["SAP_ID", "Vendor_Name", "Risk_Category", "OnTime_Delivery_Pct",
               "LeadTime_Days", "Payment_Terms", "Country_Region", "City",
               "Contact_Person", "Phone_Number", "ISO_Certification",
               "Contract_Ref", "Last_Audit_Date"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(headers)
        for s in SUPPLIERS:
            w.writerow(s)
    print(f"  ✅ 供应商: {len(SUPPLIERS)} 行 → {path}")


def write_raw_materials_csv():
    path = os.path.join(OUTPUT_DIR, "raw_materials_demo.csv")
    headers = ["SAP_ID", "Material_Description", "Mat_Group", "Base_Unit",
               "Current_Stock_Qty", "Safety_Stock_Level", "Avg_Daily_Consumption",
               "LeadTime_Days", "Quality_Score_Pct", "Defect_Pct",
               "Supplier_SAP_ID", "Warehouse_Bin", "Last_GR_Date"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(headers)
        for rm in RAW_MATERIALS:
            w.writerow(rm)
    print(f"  ✅ 原材料: {len(RAW_MATERIALS)} 行 → {path}")


def write_components_csv():
    path = os.path.join(OUTPUT_DIR, "components_demo.csv")
    headers = ["SAP_ID", "Component_Description", "CMP_Type", "Current_Stock",
               "Safety_Stock", "Qty_Per_Product", "Base_Unit", "Daily_Usage_Qty",
               "Defect_Rate_Pct", "LeadTime_Days", "WIP_Inventory"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(headers)
        for c in COMPONENTS:
            w.writerow(c)
    print(f"  ✅ 零部件: {len(COMPONENTS)} 行 → {path}")


def write_factories_csv():
    path = os.path.join(OUTPUT_DIR, "factories_demo.csv")
    headers = ["SAP_ID", "Plant_Name", "Plant_Type", "Country", "City",
               "Operational_Status", "Capacity_Util_Pct", "Total_Headcount",
               "Area_Sqm", "Established_Year", "Production_Lines"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(headers)
        for fac in FACTORIES:
            w.writerow(fac)
    print(f"  ✅ 工厂: {len(FACTORIES)} 行 → {path}")


def write_final_products_csv():
    path = os.path.join(OUTPUT_DIR, "final_products_demo.csv")
    headers = ["SAP_ID", "Product_Description", "Product_Category",
               "Monthly_Target_Yield", "Monthly_Actual_Yield", "Yield_Pct",
               "Base_Unit", "Factory_SAP_ID", "BOM_Level", "Avg_Selling_Price_USD"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(headers)
        for fp in FINAL_PRODUCTS:
            w.writerow(fp)
    print(f"  ✅ 最终产品: {len(FINAL_PRODUCTS)} 行 → {path}")


def write_links_csv():
    links = build_links()
    path = os.path.join(OUTPUT_DIR, "links_demo.csv")
    headers = ["Source_SAP_ID", "Target_SAP_ID", "Relationship_Type",
               "Relation_Label"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(headers)
        for link in links:
            w.writerow(link)
    print(f"  ✅ 语义链路: {len(links)} 条 → {path}")


# =====================================================================
# 主入口
# =====================================================================

def count_stats():
    """打印数据集统计"""
    links = build_links()
    # 区分 C / D
    all_nodes = []
    all_nodes.extend(("Supplier", s[0]) for s in SUPPLIERS)
    all_nodes.extend(("RawMaterial", rm[0]) for rm in RAW_MATERIALS)
    all_nodes.extend(("Component", c[0]) for c in COMPONENTS)
    all_nodes.extend(("FinalProduct", fp[0]) for fp in FINAL_PRODUCTS)
    all_nodes.extend(("Factory", f[0]) for f in FACTORIES)

    scenario_c = [n for n in all_nodes if not n[1].endswith(" ⚡")]
    scenario_d = [n for n in all_nodes if n[1].endswith(" ⚡")]
    scenario_c_clean = [(t, n.split(" ⚡")[0]) for t, n in scenario_d]

    print(f"""
📊 数据集统计
{'='*50}
场景 C (基线危机): {len(scenario_c)} 节点
场景 D (扩展导入): {len(scenario_d)} 节点
总节点: {len(all_nodes)} 节点
总链路: {len(links)} 条
{'='*50}
""")


def main():
    print("🔄 生成演示 CSV 数据集...\n")
    write_suppliers_csv()
    write_raw_materials_csv()
    write_components_csv()
    write_factories_csv()
    write_final_products_csv()
    write_links_csv()
    count_stats()
    print("\n✅ 全部生成完成！将 CSV 文件通过前端数据导入面板或 API 导入。")


if __name__ == "__main__":
    main()
