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

编辑 `.env` 文件，填写 LLM API Key：

```
# OpenAI
LLM_BACKEND=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1

# 或 Anthropic
# LLM_BACKEND=anthropic
# ANTHROPIC_API_KEY=sk-ant-your-key-here

# 或 MiniMax
# LLM_BACKEND=minimax
# MINIMAX_API_KEY=your-key-here
# MINIMAX_MODEL=MiniMax-M2.7
# MINIMAX_BASE_URL=https://api.minimaxi.com/v1
```

支持的 Provider: OpenAI, Anthropic, MiniMax

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
