# Golden Demo Script

## 演示准备

### 环境要求

- Neo4j 运行中
- 后端启动 (port 8000)
- 前端启动 (port 5176)
- LLM API Key 已配置（可选，deterministic 模式也可演示）

### 数据准备

1. 打开前端 → Dashboard
2. 点击 "Reset & Import Demo Data" 或通过 API: `POST /api/demo/reset` + `POST /api/demo/seed`
3. 确认 Graph Explorer 显示 12 个产品节点

## 演示路径 A：Seeded Demo（推荐）

直接使用预制数据，展示完整功能。

## 演示路径 B：Clean Graph Build

从空白图谱开始，通过 Pipeline 导入自定义 CSV。

## 演示路径 C：Custom CSV Build

使用用户的 CSV 数据构建本体。

## Agent 演示问题

### 问题 1：喂养推荐

**问**: 我应该喂我的猫吃什么？

**预期行为**:
- Agent 调用 `find_products_by_species("cat")` 等工具
- 回答结构化：简要回答 → 较安全选择 → 需要避免的产品 → 数据缺口
- 中文回答使用中文标题
- 不出现 UNKNOWN_RULE
- 不出现泛化的 "missing data_quality" 建议
- 如果生成建议，仅与猫粮推荐相关

**不应出现**:
- 英文标题（中文问题应回中文）
- UNKNOWN_RULE
- 无关产品的数据质量建议

### 问题 2：牛磺酸风险分析

**问**: 哪些猫粮缺少牛磺酸？为什么这是严重风险？

**预期行为**:
- Agent 调用 `find_cat_foods_missing_taurine()`
- 回答引用 RR002 规则和 TRIGGERS_RISK 证据边
- PF005 被明确标记
- 建议可包含标记 PF005 需要复核

**不应出现**:
- 无证据的风险断言
- UNKNOWN_RULE

### 问题 3：产品风险解释

**问**: PF003 为什么被判定为高风险？给出规则和证据边。

**预期行为**:
- Agent 调用 `get_product_risk_explanation("PF003")`
- 回答列出触发的规则、严重程度、证据
- 引用 TRIGGERS_RISK 边

### 问题 4：老年猫饮食

**问**: 如果我的猫是老年猫，哪些产品应该避免？

**预期行为**:
- Agent 调用相关工具查找老年猫产品和磷含量风险
- 回答列出需要避免的产品和原因
- 引用 RR004 规则（老年猫高磷）

### 问题 5：产品比较

**问**: PF002 和 PF009 都是幼猫食品，哪个风险更高？

**预期行为**:
- Agent 调用 `compare_products("PF002", "PF009")`
- 回答使用表格对比
- 表格正确渲染，不溢出

### 问题 6：数据缺口分析

**问**: 当前数据里有哪些产品因为缺少字段导致无法完整评估？

**预期行为**:
- Agent 调用 `find_products_with_not_evaluable_rules()`
- 回答列出具体产品和缺失字段
- 不使用泛化的 "data_quality" 标签

### 问题 7：生成数据质量建议

**问**: 请生成可审核的数据质量建议。

**预期行为**:
- Agent 生成字段特定的建议（如 taurine_mg_kg、phosphorus_100g）
- 每个建议包含 missing_field、why_it_matters、related_rule_id
- 建议可通过 "Submit to Review" 按钮提交

### 问题 8：标记高风险产品

**问**: 请把 PF005 标记为需要人工复核的高风险猫粮。

**预期行为**:
- Agent 生成 rule_action 建议
- target_object_id = PF005
- 建议可通过 Review Queue 审核

## 预期 Agent 行为总结

| 特性 | 预期 |
|---|---|
| UNKNOWN_RULE | 永不出现 |
| 泛化 data_quality | 永不出现 |
| 字段特定建议 | 包含 missing_field、why_it_matters |
| 意图门控 | 信息性问题不生成无关建议 |
| Markdown 表格 | 正确渲染，不溢出 |
| 中文回答 | 使用中文标题和术语 |
| 免责声明 | 每个回答末尾包含 |

## 避免在演示中问的问题

- 涉及兽医诊断的问题（如 "我的猫生病了吃什么"）
- 要求 Agent 直接修改图谱的问题
- 超出宠物食品领域的问题
- 期望 LLM 编造数据的问题

## 故障排除

### Agent 回答是英文但问题是中文
- 检查 LLM 是否配置
- 确认 deterministic fallback 的中文检测正常

### 建议包含 UNKNOWN_RULE
- 确认 Phase 40 代码已部署
- 检查 rule_engine 注册表是否加载

### Markdown 表格溢出
- 确认前端使用最新 build
- 检查 ReactMarkdown 组件配置

### 建议无法提交到 Review Queue
- 检查后端 API 是否正常
- 确认 agent_run_id 正确传递

## 演示中心（Phase 41）

项目现在内置了引导式演示中心，帮助演示者按步骤完成完整的产品演示。

### 使用方式

1. 打开 Dashboard
2. 点击 "Start Golden Demo" 或导航到 /demo-center
3. 选择 "Golden Demo: Pet Food Ontology Runtime"
4. 按步骤完成演示，每步有推荐页面和预期结果
5. 可以跳过不需要的步骤
6. 完成后查看演示产物

### 演示产物

演示过程中可以附加以下产物：
- Agent Trace — Agent 追踪记录
- Review Batch — 审核批次
- Graph Snapshot — 图谱快照
- Graph Diff — 图谱差异

### Demo Health Check

通过 `GET /api/demo/health` 可以检查演示环境就绪状态。
