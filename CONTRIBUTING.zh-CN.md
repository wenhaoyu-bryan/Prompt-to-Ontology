# 参与 Prompt-to-Ontology

[English guide](CONTRIBUTING.md)

本指南适用于 Pet Food 可运行参考实现的贡献。较大的功能或需求边界不清的改动，请先开 [Issue](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/issues) 讨论；小修复可以直接提交范围明确的 Pull Request（PR）。

## 启动演示环境

先安装 Git 和支持 Compose v2 的 Docker。克隆仓库并启动服务：

```bash
git clone https://github.com/wenhaoyu-bryan/Prompt-to-Ontology.git
cd Prompt-to-Ontology
cp .env.example .env
docker compose up --build --wait -d
```

打开 <http://localhost:5173>，使用 `demo` / `demo` 登录。后端 API 位于 <http://localhost:8765>。首次启动会加载 Pet Food 样例；确定性演示路径不需要 LLM 密钥。端口冲突或启动失败时，参阅 [Docker 环境指南](docs/local-docker-setup.md)。

运行 `docker compose down` 可停止容器，命名数据卷会保留，方便下次继续。

## 检查改动

在本地 Compose 容器中运行后端单元测试：

```bash
docker compose exec -T backend python -m unittest discover -s tests
```

修改前端后，使用 Node.js 20 安装依赖并运行构建与浏览器冒烟测试。运行 Playwright 时保持演示服务启动：

```bash
cd frontend
npm ci
npm run build
npx playwright install chromium
npm run test:smoke -- --workers=1
```

浏览器测试默认访问 <http://localhost:5173>。如修改了 `FRONTEND_PORT`，请将 `PLAYWRIGHT_BASE_URL` 设为对应地址。修改后端模块或 Neo4j 集成时，请补充针对性测试；PR 管线会在独立环境运行完整检查。

## 提交 Pull Request

1. 从最新 `main` 建立分支，一个 PR 只处理一项明确改动。
2. 说明改动后的行为、验证方法和已知限制。可见的 UI 改动请附截图或简短录屏。
3. 修改共用的产品文案时，同步更新英文和中文。
4. 在 PR 模板中只勾选一个**版本影响**：None 用于文档、测试和内部维护；Patch 用于兼容性修复；Minor 用于新能力和 `0.x` 阶段的兼容性变化。行为或数据契约变化时，说明迁移方式。
5. 等待 **Backend module checks**、**Neo4j integration checks**、**Frontend build** 和 **Playwright UI smoke** 全部通过。合并前，分支也必须与 `main` 保持同步。

功能 PR 不要修改 `VERSION` 或前端 package 版本。功能合并后，自动化会根据上一个 Tag 以来最高的版本影响建立独立的版本 PR。详见[发版流程](docs/releasing.md)。

样例数据应为公开或合成数据。不要提交 API 密钥、`.env`、公司内部资料，或没有测试证据支持的生产就绪声明。本仓库验证的是 Pet Food 参考流程；若提出更广泛的能力主张，请附对应证据。
