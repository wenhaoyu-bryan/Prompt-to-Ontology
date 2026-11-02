# 本地 Docker 环境搭建

## 前置要求

- Docker Desktop (Mac/Windows) 或 Docker Engine (Linux)
- Docker Compose v2
- Git

## 快速启动

```bash
git clone https://github.com/wenhaoyu-bryan/Prompt-to-Ontology.git
cd Prompt-to-Ontology
cp .env.example .env
docker compose up --build
```

## 访问地址

| 服务 | URL |
|---|---|
| 前端 | http://localhost:5173 |
| 后端 API | http://localhost:8765 |
| Neo4j Browser | http://localhost:7474 |

## 可选 LLM 配置

推荐从侧栏的**模型配置**添加 OpenAI 兼容或 Anthropic 连接，并为辅助构建、图谱问答分别选择模型。配置保存在服务端的 `backend_runtime` 卷，重启后仍保留。

也可编辑 `.env`，为未单独分配连接的 Agent 提供部署默认模型：

```
# OpenAI
LLM_BACKEND=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1

# 或 Anthropic
# LLM_BACKEND=anthropic
# ANTHROPIC_API_KEY=sk-ant-your-key-here
# ANTHROPIC_MODEL=claude-sonnet-4
# ANTHROPIC_BASE_URL=https://api.anthropic.com

# 或 MiniMax
# LLM_BACKEND=minimax
# MINIMAX_API_KEY=your-key-here
# MINIMAX_MODEL=MiniMax-M2.7
# MINIMAX_BASE_URL=https://api.minimaxi.com/v1
```

OpenAI 兼容服务可设置 `LLM_BACKEND=openai_compatible` 并配合 `OPENAI_*` 变量。环境变量修改后执行 `docker compose up -d --force-recreate backend`。

共享部署请配置 `MODEL_CONFIG_TOKEN` 和准确的 `MODEL_CONFIG_ALLOWED_ORIGINS`，公开部署使用认证反向代理保护应用。配置文件含明文密钥，应保护运行时卷及备份，不要提交到 Git。详见[模型接入与存储](question-set-evaluation.md#model-setup)。

不配置 LLM 时，Agent 使用 deterministic fallback 模式。

## 重置演示数据

通过前端 Dashboard -> Reset & Import Demo Data，或通过 API：

```bash
curl -X POST http://localhost:8765/api/demo/reset
curl -X POST http://localhost:8765/api/demo/seed
```

## 故障排除

### 端口被占用

```bash
# 查看占用端口的进程
lsof -i :5173
lsof -i :8765
lsof -i :7474

# 或修改 .env 中的端口配置
FRONTEND_PORT=5174
BACKEND_PORT=8766
```

### Neo4j 认证失败

确认 `.env` 中 NEO4J_PASSWORD 与 docker-compose.yml 中一致。

### 后端无法连接 Neo4j

```bash
# 查看后端日志
docker compose logs backend

# 确认 Neo4j 健康
docker compose ps
```

### 前端无法访问后端

确认 vite.config.js 中 proxy 目标正确。Docker 环境下使用 `http://backend:8765`（通过 `VITE_API_TARGET` 环境变量设置），本地开发默认 `http://localhost:8765`。

### Docker 缓存问题

```bash
docker compose down
docker compose build --no-cache
docker compose up
```

## 停止与清理

```bash
# 停止容器
docker compose down

# 停止并删除数据卷（清除 Neo4j 数据）
docker compose down -v
```
