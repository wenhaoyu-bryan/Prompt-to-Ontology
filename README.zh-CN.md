# <img src="frontend/public/brand/ontology-reasoning.png" width="32" height="32" alt="" /> Prompt-to-Ontology

设计本体定义，映射来源数据，在变更进入图谱前完成审核。

https://github.com/user-attachments/assets/cb35e078-3699-43fc-94d3-1f6bfcd70766

**103 秒产品演示 · v0.6.0 · 浅色主题 · DeepSeek** · [下载 MP4](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/releases/download/v0.6.0/prompt-to-ontology-v0.6.0-demo.mp4) · [English](README.md)

[![CI](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Prompt-to-Ontology 是一个开源本体工作台，连接来源数据、类型化对象、显式规则、人工审核和基于本体工具的 Agent。工作台将 Schema 设计与运行时数据导入、查询分开。内置 Pet Food 领域提供数据、规则和评测用例，用于运行完整参考流程；你也可以为自己的业务领域设计定义。

- **设计本体定义。** 从 CSV/JSON/NDJSON 文件或 PostgreSQL/MySQL DDL 开始，审核对象、属性、关系及其来源，再导出设计或保存定义到 Ontology Manager。
- **辅助构建。** 描述导入目标并上传数据文件，审核到当前运行时 Schema 的映射，处理待确认项，预览候选对象与关系。
- **审核后应用变更。** 通过 Import Plan 和 Review Queue 检查候选，再批准并应用到图谱。
- **检查答案依据。** 沿样例答案的关系路径打开来源记录，核对运行时图谱中是否存在匹配关系。
- **评测 Agent 执行。** 编辑评测问题，检查实际回答与工具结果，比较历史执行，并将反馈转为回归用例。

## 快速开始

安装 Git、Docker 和 Docker Compose v2，然后运行：

```bash
git clone https://github.com/wenhaoyu-bryan/Prompt-to-Ontology.git
cd Prompt-to-Ontology
cp .env.example .env
docker compose up --build
```

打开 **http://localhost:5173**，使用 **`demo` / `demo`** 登录。

后端首次启动默认导入样例数据。Analyst Agent 支持确定性回退模式，**无需外部 LLM API 密钥**即可体验参考流程。

| 服务 | 地址 |
| --- | --- |
| 应用 | http://localhost:5173 |
| 后端 API | http://localhost:8765 |
| Neo4j Browser | http://localhost:7474 |

请在可信的本地网络运行。演示登录只用于前端体验，不提供后端身份认证。

安装与排障参见[本地 Docker 环境搭建](docs/local-docker-setup.md)。在**模型配置**中保存 **OpenAI Chat Completions 兼容协议**或 **Anthropic Messages** 连接，分别绑定**构建（Build）**与**查询（Query）**模型。密钥保存在服务端，由 Docker 运行时卷持久化；环境变量也可提供部署默认值。没有可用模型时仍可使用确定性基线，它依据已知 Schema 别名和键匹配，不理解任意业务目标。详见[模型接入](docs/question-set-evaluation.md#model-setup)。

<details>
<summary>样例数据、持久化与演示写入设置</summary>

- 在 `.env` 设置 `AUTO_SEED_DEMO_DATA=false` 可关闭自动导入样例。
- Compose 通过 `backend_runtime` 卷保存来源数据、Import Plan、审核状态和模型连接，容器重建后仍可读取。演示重置会清理工作流数据；删除卷也会删除模型配置。
- 演示直接写入操作（包括演示重置和快照恢复）默认返回 HTTP 403。仅在可丢弃的本地演示中设置 `ENABLE_LEGACY_DEMO_WRITES=true` 并重启后端。常规构建使用 **Import Plan → Review Queue**。
- Review Queue 展示审核决定与图谱应用过程，本身不构成权限边界。

</details>

## 支持的数据源

| 来源 | 实例数据导入 | Schema 设计 | 使用方式 |
| --- | --- | --- | --- |
| CSV、扁平 JSON 数组、NDJSON（`.ndjson` / `.jsonl`） | 支持 | 支持 | 根据行和列分析数据、建立映射、提出定义。 |
| Excel（`.xlsx`） | 支持 | 暂不支持 | 选择一个工作表与表头行，预览数据后导入。 |
| PostgreSQL / MySQL DDL（`.sql`、`.ddl`） | 不支持 | 支持 | 本地解析声明的表与键，不连接实时数据库。 |
| Markdown（`.md`）产品文档 / SOP | 不支持 | 配合 DDL + 构建 Agent | 补充语义并引用原文的准确行号，不作为独立文档导入来源。 |

<details>
<summary>输入限制与文件准备</summary>

- 公开 HTTP 上传接口最多接受 **8 个文件**，单个不超过 **2 MB**，总计不超过 **8 MiB**。JSON 记录须使用一致的扁平列，不包含嵌套对象或数组。
- XLSX 每个工作簿导入一个工作表，拒绝公式和错误单元格；请使用仅含值的工作表，将含前导零的标识符存为文本。
- 每个 DDL 设计任务接受一个 `.sql` 或 `.ddl` 文件（最多 256 KiB、32 张表），同一任务不混入表格数据文件；仅解析文档列出的 DDL 子集。
- DDL 设计配合构建 Agent 可附加最多 **3 个 UTF-8 Markdown 参考文档**：单个 12 KiB，总计 24 KiB、600 行。文档正文会发送给当前配置的模型服务。

支持语法和完整限制参见[辅助构建与 Schema 设计](docs/assisted-build.md)。

</details>

## 构建流程

### 将实例导入已有 Schema

1. 打开**数据管道 → 导入数据**，添加来源文件并描述导入目标。
2. 助手提出到当前运行时 Schema 的映射，包括对象类型、身份字段和关系端点。
3. 处理待确认项，选择**确认映射并预览**，检查候选值与变更。
4. 将审核后的预览提交到 **Review Queue**。检查每项候选，分别执行**批准**和**应用**。
5. 返回**检查运行时图谱**，核对 Neo4j 中的对象、属性和关系。

**手动配置**也提供六步导入流程。

### 设计新的本体定义

1. 打开**数据管道 → 设计本体草稿**，提供 CSV/JSON/NDJSON 文件或 DDL。
2. 确定性分析建立来源结构，可选的构建 Agent 补充语义建议。
3. 审核定义和来源绑定，完成选择，检查定义差异后保存。
4. 导出设计包，或选择**保存定义到本体管理**。
5. 在 **Ontology Manager** 的统一抽屉中编辑对象、属性和关系。通过**查看来源**检查溯源信息，或从**类型图**打开定义。

**保存设计或 Manager 目录不等于激活运行时 Schema。** 导入与查询仍使用配置的 YAML 定义。交接边界参见[辅助构建与 Schema 设计](docs/assisted-build.md)。

对于 DDL，模型只能建议展示名称、描述和带引用的审核备注；技术标识符、类型、键、绑定和关系由解析出的声明决定。产品文档和 SOP 可提供待审核的术语或规则候选，不会自动变成可执行规则。流程不会凭空生成或执行任意 SQL。

体验参考流程时，可运行**评测与反馈 → 参考样例 · 22 题 → Q03：PF001 的第一种原料是什么？**，查看 `CONTAINS` 路径和来源记录，再选择 **Explore in graph**。向 **Analyst Agent** 提问“Which products contain chicken?”，检查运行时工具调用和关系路径。在**评测与反馈**中比较 Agent 执行、人工审核需要判断的回答，并将查询反馈转为可编辑用例。

参考实现还包含对象与图谱探索、四状态规则评估、Agent Trace，以及图谱快照、差异比较和回滚。可通过 **Demo Center → Start Golden Demo** 进入引导式体验。

<details>
<summary>查看 v0.6.0 流程截图</summary>

### 运行概览

![已载入 Pet Food 样例的 Dashboard](media/dashboard.png)

### 辅助构建

![描述构建目标并上传三个来源文件](media/build-sources.png)

### 来源映射

![来源字段类型、空值与样例记录](media/data-profile.png)

![来源字段映射与审核操作](media/data-pipeline.png)

确认映射后再准备候选。确认映射只记录建模决定，不证明数据已可在 Neo4j 中查询。

### 变更审核

![Review Queue 中的候选产品与属性](media/review-queue.png)

批准前检查候选。视频在已载入样例的图谱中添加 PF101、两个原料和两条 `CONTAINS` 关系。五项变更均经过审核和应用，并非从空白状态重建全部图谱。

![PetFoodProduct 定义与 Schema 草稿操作](media/ontology-manager.png)

这张 v0.6.0 截图早于当前的 Manager 目录与统一定义抽屉。

### 图谱探索

![类型化对象与关系筛选的 Graph Explorer](media/graph.png)

搜索对象、查看邻域，或展开总览中的关系展示。

### 答案证据

![Q03 的答案、关系路径与 CSV 来源记录](media/verified-questions.png)

固定问题 Q03 从仓库内样例文件读取答案，Graph Explorer 单独核对运行时图谱中是否存在对应关系。

![Agent 查询返回的 PF101 邻域及运行时匹配关系](media/graph-evidence.png)

### Analyst Agent

![DeepSeek 实时回答刚导入的 PF101 包含哪些原料](media/analyst-agent.png)

视频中的构建建议、查询规划和答案总结均调用 DeepSeek，展示实际工具记录，并在运行时图谱核对返回的关系。

</details>

视频和截图保留了较早的 v0.6.0 浅色界面，展示辅助导入、人工审核、运行时验证和实时模型查询。当前 Schema 设计、来源支持及 Manager 编辑已扩展，截图未涵盖这些能力。当前流程参见[辅助构建](docs/assisted-build.md)、[问答工作台](docs/query-workbench.md)和[评测与反馈](docs/question-set-evaluation.md)。

[完整产品流程](docs/product-workflow.md) · [录制说明与其他截图](media/README.md)

## 项目范围与评估

本仓库用于学习与验证设计，尚未证明生产就绪、企业级身份与权限管理能力，或跨业务领域的适用性。

- **参考答案与 Agent 查询使用不同依据。** 参考样例读取仓库内的 CSV/YAML，图谱高亮核对运行时关系。Agent 查询调用运行时工具；返回的证据字符串不等于原始文件行或文档片段引用。
- **评测分数只覆盖配置的检查项。** Agent 评测记录实际回答、工具和 Trace，按配置检查项计分，需要判断的回答单独人工审核。分数不代表通用 Agent 的正确率。视频使用已配置的 DeepSeek 模型，录屏和仓库均不包含密钥。
- **设计目录与运行时定义分开。** Ontology Manager 在设计目录中保存审核后的定义和来源溯源；导入与查询继续使用配置的 YAML Schema，运行时接入需要单独完成。
- **规则结果描述样例。** 结果取决于现有数据和配置条件，不能作为兽医建议；缺少证据时，规则可能无法评估。

<details>
<summary>建模方法与固定问题评估</summary>

Prompt 用于提出决策问题与建模假设，随后逐步完成：

1. 检查来源字段、空值与内容版本。
2. 提出对象、属性和关系映射，交由人工审核。
3. 在 YAML 中定义类型、约束、规则和 Action 契约。
4. 通过 Import Plan 生成候选变更。
5. 审核并应用候选，检查结果与证据。

[v1 八题集](sample-data/pet-food/question-set.v1.json)是固定来源输入哈希的设计基线；[v2 22 题目录](sample-data/pet-food/verified-questions.v2.json)提供固定范围的只读查询计划。独立的[参考答案](sample-data/pet-food/verified-gold.v2.json)只供回归评估器读取。

回归评估分别检查结论、来源证据、评估路径和恰当弃答。支持重跑受变更资产影响的问题、逐题比较两轮结果，以及将新增问题建议保存为草稿。这些检查评估固定样例读取器，不代表通用 Agent 的可靠性。

</details>

## 文档

| 指南 | 内容 |
| --- | --- |
| [文档索引](docs/README.md) | 产品、架构与开发文档 |
| [辅助构建与 Schema 设计](docs/assisted-build.md) | 来源支持、Agent 流程、DDL/文档辅助和 Manager 交接 |
| [数据管道](docs/data-pipeline.md) | 来源画像、映射与 Import Plan |
| [Review Queue](docs/review-queue-runtime.md) | 审核决定与图谱应用 |
| [本体内核](docs/ontology-kernel.md) | Schema 定义与校验 |
| [查询工作台](docs/query-workbench.md) | 会话、运行时工具、关系路径与反馈 |
| [评测与反馈](docs/question-set-evaluation.md) | 模型接入、用例编辑、历史比较与人工审核 |
| [Analyst Agent](docs/agent-operator.md) | 本体工具与待审建议 |
| [Agent Trace 与评估](docs/agent-trace-evaluation.md) | 执行轨迹与评估方法 |
| [图谱治理](docs/graph-snapshot-diff-rollback.md) | 快照、差异比较与回滚 |

**技术栈：** React · FastAPI · Neo4j · Sigma.js / Graphology · React Flow · Docker Compose。界面支持英文与中文。

## 开发与验证

在仓库根目录运行后端单元测试：

```bash
PYTHONPATH=backend python -m unittest discover -s backend/tests
```

在 `frontend/` 目录安装依赖并构建：

```bash
npm ci
npm run build
```

启动本地 Compose 服务后，在 `frontend/` 运行 `npm run test:smoke -- --workers=1` 执行 Playwright 检查。GitHub Actions 还会运行后端模块和 Neo4j 集成检查；CI 不部署项目。

开发要求参见[贡献指南](CONTRIBUTING.zh-CN.md)，版本与发布流程参见[发版说明](docs/releasing.md)。

## 设计参考

项目参考公开的 [Palantir Foundry Ontology 概念](https://www.palantir.com/docs/foundry/ontologies/ontologies-overview)与 [Semantica](https://github.com/semantica-agi/semantica)，不声称访问供应商内部实现或具备等价功能。

Graph Explorer 的布局和探索交互参考 Semantica 的 Knowledge Explorer。本项目使用 Sigma.js 与 Graphology 实现图谱视图，使用 React Flow 展示答案路径。

## 参与贡献

欢迎提交可复现的问题报告、文档改进和有针对性的测试。较大改动请先通过 issue 讨论范围。

提交 PR 前请阅读[贡献指南](CONTRIBUTING.zh-CN.md)。

## 许可

[MIT](LICENSE)。第三方媒体保留各自许可，参见[音乐署名](media/README.md#music-credit)。
