"""
LLM 推理客户端 — ReAct Tool-calling 循环
LLM 作为分析师在知识图谱上自主探索，沿本体网络追踪影响链。
"""

import os
import json
import re
import time
from dotenv import load_dotenv

load_dotenv()

LLM_BACKEND = os.environ.get("LLM_BACKEND", "minimax")

# ============================================================
# 工具定义 (OpenAI function-calling 格式)
# ============================================================

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "impact_analysis",
            "description": "分析某个节点的下游影响范围。从该节点出发，沿 USED_IN / ASSEMBLED_INTO 等关系向下游追踪，找出所有受影响的节点及其层级深度。常用于评估 '这个节点出问题会影响谁'。",
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "string", "description": "要分析的节点 ID"},
                    "depth": {"type": "integer", "description": "追踪深度，默认 3", "default": 3},
                },
                "required": ["node_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_node",
            "description": "查询某个节点的完整属性、上游关联和下游关联。返回节点的所有字段值、入边列表和出边列表。",
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "string", "description": "要查询的节点 ID"},
                },
                "required": ["node_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "shortest_path",
            "description": "查找从节点 A 到节点 B 的最短物料路径，返回每一跳的节点名称和类型。用于验证 'A 是否确实会影响到 B'。",
            "parameters": {
                "type": "object",
                "properties": {
                    "from_id": {"type": "string", "description": "起始节点 ID"},
                    "to_id": {"type": "string", "description": "目标节点 ID"},
                },
                "required": ["from_id", "to_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_nodes",
            "description": "在知识图谱中全文搜索节点，按名称或 ID 匹配。用于发现'还有哪些节点与某个关键词相关'。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_schema",
            "description": "查询当前本体的 Schema 结构：类定义、关系类型、属性列表。用于理解数据模型和实体之间的关系。",
            "parameters": {
                "type": "object",
                "properties": {
                    "class_name": {
                        "type": "string",
                        "description": "可选。指定类名查看该类的详细 Schema。为空则返回全部 Schema。",
                    },
                },
            },
        },
    },
]

SYSTEM_PROMPT = """你是 Ontology OS 的企业级 AI 分析师。你的任务是理解用户的业务问题，
使用图谱查询工具获取相关数据，基于实际数据做出分析和建议。

你的能力：
1. query_schema: 查询本体 Schema（类、关系、属性），理解数据模型
2. query_node: 查询具体节点的属性和关系
3. impact_analysis: 分析节点的影响范围
4. shortest_path: 查找两个节点之间的路径
5. search_nodes: 全文搜索节点

推理策略：
- 收到问题时，先用 query_schema 了解相关的实体类型和关系
- 再用 query_node 查询具体的节点数据
- 结合 Schema 属性定义和数据事实进行推理

当前图谱中的数据可能来自不同行业，请根据 Schema 和实际数据来分析。

输出格式为 JSON 数组，每个元素是一个推理步骤。

推理步骤类型和内容要求：

1. observation: 列出关键属性的具体数值，明确指出哪些异常
   message 至少 80 字，对比正常值和实际值

2. thought: 将当前节点的异常与其上下游关联起来，推演传导链
   message 至少 80 字，分析"如果这个问题不解决，会沿着什么路径影响到哪些节点"

3. impact: 量化影响范围（节点数、类型分布、最远传导距离）
   message 至少 80 字，包含具体数字

4. tool_call: 调用工具获取更多数据（可选）
   支持的工具: impact_analysis / query_node / shortest_path / search_nodes

5. decision: 给出可执行的业务建议，包含具体数字
   message 至少 80 字，写明建议什么、为什么、预期效果

要求：
- 每个步骤的 message 至少 80 字。不要输出单句话
- 数值基于实际数据，不臆测
- 语言：中文
- 推理过程分两阶段输出

最终 decision 格式：
{
  "step": <序号>,
  "type": "decision",
  "data": {
    "action_name": "<动作>",
    "params": {<参数>},
    "reasoning": "<完整的推理链>",
    "requires_approval": true|false
  }
}"""


# ============================================================
# 工具执行器
# ============================================================

def _execute_tool(name: str, args: dict) -> dict:
    """执行工具调用，返回结果"""
    if name == "impact_analysis":
        from ontology import get_impact_analysis
        node_id = args.get("node_id", "")
        depth = args.get("depth", 3)
        result = get_impact_analysis(node_id, depth)
        return {
            "source": node_id,
            "total_affected": result.get("total_affected", 0),
            "affected_nodes": list(result.get("affected_nodes", {}).keys())[:15],
            "detail": {k: {"label": v["label"], "depth": v["depth"], "alert": v["alert"]}
                       for k, v in list(result.get("affected_nodes", {}).items())[:15]},
        }

    elif name == "query_node":
        from ontology import get_node_detail
        node_id = args.get("node_id", "")
        detail = get_node_detail(node_id)
        if not detail:
            return {"error": f"节点 {node_id} 不存在"}
        return {
            "id": node_id,
            "label": detail.get("label", node_id),
            "type": detail.get("object_type", ""),
            "alert": detail.get("alert", False),
            "properties": {k: v for k, v in detail.items()
                           if k not in ('outgoing_links', 'incoming_links', 'id', 'label', 'object_type', 'color', 'size')},
            "upstream_count": len(detail.get("incoming_links", [])),
            "downstream_count": len(detail.get("outgoing_links", [])),
            "sample_downstream": [
                {"id": l["targetId"], "label": l["targetLabel"], "type": l["linkType"]}
                for l in detail.get("outgoing_links", [])[:5]
            ],
        }

    elif name == "shortest_path":
        from ontology import find_shortest_path_to_product
        from_id = args.get("from_id", "")
        to_id = args.get("to_id", "")
        result = find_shortest_path_to_product(from_id, to_id)
        return result

    elif name == "search_nodes":
        from neo4j_connector import search_nodes
        query = args.get("query", "")
        results = search_nodes(query)
        return {"query": query, "count": len(results), "results": results[:10]}

    elif name == "query_schema":
        from neo4j_connector import get_driver
        driver = get_driver()
        schema: dict = {"classes": [], "relationships": []}
        class_name = args.get("class_name", "")

        with driver.session() as session:
            if class_name:
                labels = [class_name]
            else:
                labels_result = session.run("CALL db.labels()")
                labels = [r["label"] for r in labels_result]

            for label in labels:
                count = session.run(f"MATCH (n:`{label}`) RETURN count(n) AS cnt").single()["cnt"]
                if count == 0:
                    continue
                sample = session.run(f"MATCH (n:`{label}`) RETURN n LIMIT 5")
                props = set()
                for record in sample:
                    for k in dict(record["n"]).keys():
                        if k not in ("id", "name", "dataset", "label"):
                            props.add(k)
                schema["classes"].append({
                    "name": label,
                    "count": count,
                    "properties": sorted(props),
                })

            rel_result = session.run("CALL db.relationshipTypes()")
            for r in rel_result:
                rel_type = r["relationshipType"]
                cnt = session.run(f"MATCH ()-[r:`{rel_type}`]->() RETURN count(r) AS c").single()["c"]
                schema["relationships"].append({"type": rel_type, "count": cnt})

        return schema

    return {"error": f"未知工具: {name}"}


# ============================================================
# ReAct 循环
# ============================================================

def reason(node_id: str) -> dict:
    """单次 ReAct 推理：LLM 自主观察、调工具、给决策"""
    context = _build_context(node_id)
    if "error" in context:
        return _error_response(node_id, context["error"])

    logs = []
    initial_prompt = _format_initial_prompt(context)

    try:
        resp = _call_llm(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": initial_prompt + "\n\n请分析这个节点，可调用工具探索。最后给出 decision。"},
            ],
            tools=TOOLS,
        )
        msg = resp.get("message", {}) or {}
        content = msg.get("content", "") or ""
        tool_calls = msg.get("tool_calls", [])

        # 原始观察
        if content.strip():
            logs.append({
                "step": 1, "type": "observation", "icon": "👁️", "color": "green",
                "message": content[:600].strip(),
                "timestamp": time.strftime("%H:%M:%S"),
            })

        # 工具调用
        for tc in (tool_calls or []):
            func = tc.get("function", {})
            tool_name = func.get("name", "")
            tool_args = json.loads(func.get("arguments", "{}"))
            logs.append({
                "step": len(logs) + 1, "type": "tool_call", "icon": "🔧", "color": "blue",
                "message": f"🔧 调用 [{tool_name}] → {json.dumps(tool_args, ensure_ascii=False)}",
                "data": {"tool": tool_name, "params": tool_args},
                "timestamp": time.strftime("%H:%M:%S"),
            })
            tool_result = _execute_tool(tool_name, tool_args)
            summary = _summarize_tool_result(tool_name, tool_result)
            logs.append({
                "step": len(logs) + 1, "type": "observation", "icon": "👁️", "color": "green",
                "message": f"👁️ [{tool_name}] {summary}",
                "data": tool_result,
                "timestamp": time.strftime("%H:%M:%S"),
            })
    except Exception as e:
        return _fallback_reason(node_id, f"推理失败: {e}")

    # 提取 decision
    decision = None
    requires_approval = False
    for log in logs:
        if log.get("type") == "decision":
            decision = log.get("data")
            requires_approval = decision.get("requires_approval", False) if decision else False

    if not decision and context.get("alert_status"):
        decision = {
            "action_name": "manual_review",
            "params": {"node_id": node_id},
            "reasoning": "节点告警，建议人工审核。",
            "requires_approval": True,
        }
        requires_approval = True
        logs.append({
            "step": len(logs) + 1, "type": "decision", "icon": "🎯", "color": "purple",
            "message": "🎯 自动决策：节点告警，建议人工审核。", "data": decision,
            "timestamp": time.strftime("%H:%M:%S"),
        })

    return {"node_id": node_id, "logs": logs, "decision": decision, "requires_approval": requires_approval}


# ============================================================
# LLM 调用（统一接口，支持 tool calling）
# ============================================================

def _call_llm(messages: list[dict], tools: list[dict] | None = None) -> dict:
    """统一 LLM 调用，返回 OpenAI 格式的 response dict"""
    import requests

    if LLM_BACKEND == "anthropic":
        return _call_anthropic_with_tools(messages, tools)
    elif LLM_BACKEND == "openai":
        return _call_openai_compat(messages, tools)
    else:  # minimax (OpenAI 兼容)
        return _call_openai_compat(messages, tools)


def _call_openai_compat(messages: list[dict], tools: list[dict] | None = None) -> dict:
    """OpenAI 兼容接口（MiniMax 也用这个）"""
    import requests

    if LLM_BACKEND == "minimax":
        api_key = os.environ.get("MINIMAX_API_KEY", "")
        base_url = os.environ.get("MINIMAX_BASE_URL", "https://api.minimaxi.com/v1")
        model = os.environ.get("MINIMAX_MODEL", "MiniMax-M2.7")
    else:
        api_key = os.environ.get("OPENAI_API_KEY", "")
        base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        model = os.environ.get("OPENAI_MODEL", "gpt-4o")

    if not api_key:
        raise RuntimeError(f"{LLM_BACKEND} API Key 未配置")

    body = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4096,
    }
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"

    resp = requests.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=body,
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    choice = data.get("choices", [{}])[0]
    msg = choice.get("message") or choice.get("messages", [{}])[0]
    # 去掉 MiniMax 的 <think>...</think> 包装块
    raw = msg.get("content", "") or ""
    # 递归剥离所有 think 标签
    prev = None
    while prev != raw:
        prev = raw
        raw = re.sub(r'<think>[\s\S]*?</think>', '', raw)
    # 如果还有未闭合的 <think>
    raw = re.sub(r'<think>[\s\S]*$', '', raw)
    msg["content"] = raw.strip()
    return {"message": msg}


def _call_anthropic_with_tools(messages: list[dict], tools: list[dict] | None = None) -> dict:
    """Anthropic Claude API，转换 OpenAI tool 格式"""
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY 未配置")

    # 提取 system prompt
    system = ""
    user_msgs = []
    for m in messages:
        if m["role"] == "system":
            system = m["content"]
        elif m["role"] == "user":
            user_msgs.append({"role": "user", "content": m["content"]})
        elif m["role"] == "assistant":
            user_msgs.append({"role": "assistant", "content": m.get("content") or ""})
        elif m["role"] == "tool":
            user_msgs.append({"role": "user", "content": f"[工具返回]: {m['content']}"})

    # Anthropic tool 格式
    anthropic_tools = None
    if tools:
        anthropic_tools = []
        for t in tools:
            func = t.get("function", {})
            anthropic_tools.append({
                "name": func["name"],
                "description": func["description"],
                "input_schema": {
                    "type": "object",
                    "properties": func.get("parameters", {}).get("properties", {}),
                    "required": func.get("parameters", {}).get("required", []),
                },
            })

    client = anthropic.Anthropic(api_key=api_key)
    kwargs = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 4096,
        "temperature": 0.3,
        "system": system,
        "messages": user_msgs,
    }
    if anthropic_tools:
        kwargs["tools"] = anthropic_tools

    resp = client.messages.create(**kwargs)

    # 转换回 OpenAI 格式
    content = ""
    tool_calls = []
    for block in resp.content:
        if block.type == "text":
            content = block.text
        elif block.type == "tool_use":
            tool_calls.append({
                "id": block.id,
                "type": "function",
                "function": {
                    "name": block.name,
                    "arguments": json.dumps(block.input),
                },
            })

    return {"message": {"content": content, "tool_calls": tool_calls if tool_calls else None}}


# ============================================================
# 辅助函数
# ============================================================

def _build_context(node_id: str) -> dict:
    from ontology import get_node_detail, get_impact_analysis

    detail = get_node_detail(node_id)
    if not detail:
        return {"error": f"Node {node_id} not found"}

    impact = get_impact_analysis(node_id, depth=2)

    upstream = []
    downstream = []
    for link in detail.get('incoming_links', []):
        upstream.append({"id": link.get('sourceId',''), "from": link.get('sourceLabel'), "type": link.get('linkType'), "fromType": link.get('sourceType')})
    for link in detail.get('outgoing_links', []):
        downstream.append({"id": link.get('targetId',''), "to": link.get('targetLabel'), "type": link.get('linkType'), "toType": link.get('targetType')})

    return {
        "node_id": node_id,
        "node_label": detail.get('label', node_id),
        "node_type": detail.get('object_type', 'Unknown'),
        "properties": {k: v for k, v in detail.items()
                       if k not in ('outgoing_links', 'incoming_links', 'id', 'label', 'object_type')},
        "upstream": upstream,
        "downstream": downstream,
        "impact_preview": {"total_affected": impact.get('total_affected', 0)},
        "alert_status": detail.get('alert', False),
    }


def _format_initial_prompt(ctx: dict) -> str:
    return f"""请分析以下本体节点，调用工具自主探索，最后给出决策。

起始节点:
  ID: {ctx['node_id']}
  名称: {ctx['node_label']}
  类型: {ctx['node_type']}
  属性: {json.dumps(ctx['properties'], ensure_ascii=False, indent=2)}
  告警: {'⚠️ 告警' if ctx['alert_status'] else '✅ 正常'}

  上游 ({len(ctx['upstream'])} 条): {json.dumps(ctx['upstream'], ensure_ascii=False)}
  下游 ({len(ctx['downstream'])} 条): {json.dumps(ctx['downstream'], ensure_ascii=False)}
  影响预览: {ctx['impact_preview']['total_affected']} 个节点受影响

重要：调用工具时请使用节点 ID（如 CMP-001），不要使用名称。"""[:4000]


def _summarize_tool_result(name: str, result: dict) -> str:
    if name == "impact_analysis":
        return f"共 {result.get('total_affected', 0)} 个节点受影响"
    elif name == "query_node":
        return f"节点「{result.get('label', '?')}」({result.get('type', '?')})，告警={'是' if result.get('alert') else '否'}，下游 {result.get('downstream_count', 0)} 个"
    elif name == "shortest_path":
        if result.get("error"):
            return result["error"]
        return f"路径长度 {result.get('path_length', 0)}，途经: {' → '.join(p['label'] for p in result.get('path', []))}"
    elif name == "search_nodes":
        return f"找到 {result.get('count', 0)} 个匹配节点"
    return json.dumps(result, ensure_ascii=False)[:200]


def _parse_extended(content: str) -> list[dict]:
    """解析 LLM 文本输出为结构化日志数组"""
    if not content or not content.strip():
        return []

    # 尝试直接解析 JSON 数组
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            return [parsed]
    except json.JSONDecodeError:
        pass

    # 尝试提取 JSON 代码块
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # 尝试按推理步骤类型分段
    steps = []
    type_keywords = [
        ("observation", r'[（(]?[观观][察察][）)]?'),
        ("thought", r'[（(]?[思思][考考][）)]?'),
        ("impact", r'[（(]?[影影][响响][）)]?'),
        ("decision", r'[（(]?[决决][策策][）)]?'),
    ]

    lines = content.strip().split('\n')
    current_type = "observation"
    current_text = []

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue

        matched_type = None
        for t, pattern in type_keywords:
            if re.search(pattern, line_stripped[:20]):
                matched_type = t
                break

        if matched_type:
            if current_text:
                steps.append({
                    "type": current_type,
                    "message": '\n'.join(current_text)[:500],
                })
            current_type = matched_type
            # 去掉类型标记后的文字
            rest = re.sub(r'^[#*\-–—\s]*(?:步骤|Step)?[\s#*]*\d*[:：\s]*', '', line_stripped, flags=re.IGNORECASE)
            current_text = [rest] if rest else []
        else:
            current_text.append(line_stripped)

    if current_text:
        steps.append({
            "type": current_type,
            "message": '\n'.join(current_text)[:500],
        })

    return steps if steps else [{"type": "observation", "message": content[:500]}]


def _extract_decision(content: str, node_id: str) -> dict | None:
    """从 LLM 文本输出中提取 decision JSON"""
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict) and parsed.get("type") == "decision":
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
    if match:
        try:
            data = json.loads(match.group(1))
            if isinstance(data, dict) and data.get("type") == "decision":
                return data
        except json.JSONDecodeError:
            pass

    return None


def _fallback_reason(node_id: str, reason: str) -> dict:
    from ontology import get_node_detail, get_impact_analysis
    detail = get_node_detail(node_id)
    impact = get_impact_analysis(node_id, depth=3)
    label = detail.get('label', node_id) if detail else node_id
    alert = detail.get('alert', False) if detail else False
    total = impact.get('total_affected', 0) if impact else 0

    logs = [{
        "step": 1, "type": "observation", "icon": "👁️", "color": "green",
        "message": f"📊 节点「{label}」告警={'⚠️' if alert else '✅'}，影响范围={total} 节点。",
    }, {
        "step": 2, "type": "thought", "icon": "🧠", "color": "orange",
        "message": f"💡 降级推理（{reason}）。",
    }]
    if alert:
        d = {"action_name": "manual_review", "params": {"node_id": node_id}, "reasoning": "降级推理", "requires_approval": True}
        logs.append({"step": 3, "type": "decision", "icon": "🎯", "color": "purple", "message": "🎯 建议人工审核。", "data": d})
        return {"node_id": node_id, "logs": logs, "decision": d, "requires_approval": True}
    return {"node_id": node_id, "logs": logs, "decision": None, "requires_approval": False}


def _error_response(node_id: str, error: str) -> dict:
    return {
        "node_id": node_id,
        "logs": [{"step": 1, "type": "error", "icon": "❌", "color": "red", "message": f"❌ {error}"}],
        "decision": None, "requires_approval": False,
    }


# ============================================================
# Schema 推断 (Phase 6)
# ============================================================

def infer_schema(filename: str, headers: list[str], rows: list[dict]) -> dict:
    """
    使用 LLM 推断 CSV 数据的本体映射关系。
    返回: { nodes, edges, fieldMappings, reasoning }
    """
    sample = f"文件名: {filename}\n列 ({len(headers)}): {', '.join(headers)}\n\n样本:\n"
    for i, row in enumerate(rows):
        sample += f"  [{i+1}] {json.dumps(row, ensure_ascii=False)}\n"

    INFER_PROMPT = """你是企业数据架构师。分析 CSV 样本，推断本体图谱映射。

分析维度：
1. 识别实体类型（节点）：从列名和数据推断有哪些实体
2. 识别主键列：哪列是唯一 ID
3. 识别名称列：哪列是人类可读名称
4. 识别属性列：剩余列映射为 camelCase 属性
5. 识别外键关系：某列引用了另一实体的 ID → 这是一条边
6. 推断关系类型：根据语义推断边类型

属性命名规则：
- camelCase（如 Defect_Pct → defectRate, Safety_Stock_Level → safetyStockLevel）
- 保持语义，不要逐字翻译（如 Risk_Category → riskLevel，不是 riskCategory）

输出严格 JSON：
{
  "nodes": [{
    "type": "Supplier",
    "idColumn": "Vendor_ID",
    "nameColumn": "Vendor_Name",
    "label": "供应商",
    "properties": [
      {"csvColumn": "Risk_Category", "propertyName": "riskLevel", "type": "string"},
      {"csvColumn": "OnTime_Delivery_Pct", "propertyName": "onTimeDeliveryRate", "type": "number"}
    ]
  }],
  "edges": [{
    "fromType": "Supplier",
    "fromColumn": "Vendor_ID",
    "toType": "Material",
    "toColumn": "Material_ID",
    "relationshipType": "SUPPLIES",
    "label": "供应"
  }],
  "reasoning": "数据包含供应商和原材料..."
}

规则：
- 每行通常是一个节点
- 含 _ID 的列通常是外键
- 数值列（百分比/数量/金额）是属性
- 分类列（Level/Status/Category）是枚举属性
- 如果无法确定某列用途，放入最近节点的 properties
- edges 可以为空（单实体数据集）"""

    try:
        messages = [
            {"role": "system", "content": INFER_PROMPT},
            {"role": "user", "content": sample},
        ]
        resp = _call_llm(messages)
        content = resp.get("message", {}).get("content", "")

        # 剥离 think 标签
        prev = None
        while prev != content:
            prev = content
            content = re.sub(r'<think>[\s\S]*?</think>', '', content)
        content = re.sub(r'<think>[\s\S]*$', '', content).strip()

        parsed = _extract_json(content)
        if parsed and "nodes" in parsed:
            return parsed
        return _fallback_infer_schema(headers)
    except Exception as e:
        print(f"[infer_schema] LLM 失败: {e}")
        return _fallback_infer_schema(headers)


def _extract_json(text: str) -> dict | None:
    """从 LLM 输出中提取 JSON"""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    return None


def _fallback_infer_schema(headers: list[str]) -> dict:
    """LLM 不可用时的规则降级推断"""
    id_cols = [h for h in headers if '_ID' in h.upper() or h.upper().endswith('ID')]
    name_cols = [h for h in headers if any(k in h.upper() for k in ['_NAME', '_DESCRIPTION', 'NAME'])]

    if not id_cols:
        id_cols = [headers[0]]

    nodes = []
    for id_col in id_cols:
        prefix = id_col.upper().replace('_ID', '').replace('ID', '')
        node_type = prefix.title().replace('_', '') if prefix else 'Entity'
        name_col = next((c for c in name_cols if prefix in c.upper()), name_cols[0] if name_cols else id_col)

        props = []
        for h in headers:
            if h not in (id_col, name_col):
                props.append({"csvColumn": h, "propertyName": _to_camel(h), "type": "string"})

        nodes.append({
            "type": node_type,
            "idColumn": id_col,
            "nameColumn": name_col,
            "label": node_type,
            "properties": props,
        })

    return {
        "nodes": nodes,
        "edges": [],
        "reasoning": f"LLM 不可用，使用规则推断。识别到 {len(nodes)} 个节点类型，请手动校准。",
    }


def _to_camel(s: str) -> str:
    parts = s.lower().replace(' ', '_').replace('-', '_').split('_')
    return parts[0] + ''.join(p.title() for p in parts[1:])


# ============================================================
# 多表联合推断 (Phase 6 重写)
# ============================================================

def infer_schema_multi(tables: list[dict]) -> dict:
    """
    多表联合推断：分析所有表的元数据，输出全局 MappingSchema。

    输入: [{filename, tableDescription, fields: [{chineseName, fieldId, dataType, sampleValues}], sampleRows}]
    输出: {
      "tables": [{filename, nodeType, label, idColumn, nameColumn, tableCategory, properties}],
      "relationships": [{fromTable, fromColumn, toTable, toColumn, relationshipType, label}],
      "reasoning": "..."
    }
    """
    table_summaries = []
    for t in tables:
        fields_desc = []
        for f in t["fields"]:
            fields_desc.append(f"  - {f['fieldId']} ({f['chineseName']}) : {f['dataType']}")
            if f.get("sampleValues"):
                fields_desc.append(f"    样本: {', '.join(str(v) for v in f['sampleValues'][:3])}")

        sample_desc = ""
        for i, row in enumerate(t.get("sampleRows", [])[:3]):
            sample_desc += f"  [{i+1}] {json.dumps(row, ensure_ascii=False)}\n"

        table_summaries.append(f"""=== {t['filename']} ===
表描述: {t.get('tableDescription', '未知')}
字段 ({len(t['fields'])}):
{chr(10).join(fields_desc)}
样本数据:
{sample_desc}""")

    all_tables = "\n\n".join(table_summaries)

    MULTI_INFER_PROMPT = """你是资深企业数据架构师和知识图谱专家。分析多张 CSV 表的元数据，推断全局本体图谱映射。

## 核心原则

1. **每张表 = 一个节点类型**：无论是事实表（订单、库存记录）还是维度表（产品、客户），每张表都映射为一种节点类型。事实表的每一行就是一个节点实例。
2. **外键 = 关系（边）**：当一个表的字段引用另一个表的主键时，这是一条语义关系。
3. **事实表不是边**：销售订单表、库存记录表等事实表有自己独立的 ID、时间戳、业务属性，它们是节点而非关系。订单连接客户和产品是通过两条边（订单→客户、订单→产品），而不是把订单压缩成一条边。
4. **字段元数据已预处理**：每个字段都有 chineseName（中文名）、fieldId（英文ID）、dataType（数据类型），直接使用 fieldId 作为列标识。

## 属性命名规则

- 使用 camelCase（如 product_name → productName, cost_price → costPrice）
- 保持语义精确（如 selling_price → sellingPrice，不是 price）
- 枚举值保持原样（如 "在售"、"已完成"）

## 输出严格 JSON：

{
  "tables": [
    {
      "filename": "销售订单表(sales_orders).csv",
      "nodeType": "SalesOrder",
      "label": "销售订单",
      "idColumn": "order_id",
      "nameColumn": "order_id",
      "tableCategory": "fact",
      "properties": [
        {"csvColumn": "order_date", "propertyName": "orderDate", "type": "string"},
        {"csvColumn": "quantity", "propertyName": "quantity", "type": "number"},
        {"csvColumn": "actual_amount", "propertyName": "actualAmount", "type": "number"}
      ]
    }
  ],
  "relationships": [
    {
      "fromTable": "销售订单表(sales_orders).csv",
      "fromColumn": "customer_id",
      "toTable": "客户信息表(customer_info).csv",
      "toColumn": "customer_id",
      "relationshipType": "PLACED_BY",
      "label": "下单客户"
    }
  ],
  "reasoning": "分析说明..."
}

## 关系推断规则

- 对比所有表的字段名，找出共享的 ID 字段（如 customer_id 同时出现在订单表和客户表）
- 关系方向：从事实表指向维度表（订单→客户，订单→产品，库存→产品）
- 关系类型使用英文大写下划线格式（PLACED_BY, CONTAINS, SUPPLIED_BY）
- 如果多张表有相同的外键（如 product_id 出现在订单表和库存表），每张表独立建立与维度表的关系

## 重要

- 不要遗漏任何表，每张表必须有一个 table 条目
- 不要遗漏任何跨表关系
- properties 中的 type 只能是 "string" | "number" | "date"
- 如果字段同时出现在 idColumn/nameColumn 和 properties 中，只放在 idColumn/nameColumn
- tableCategory 只能是 "fact" 或 "dimension" """

    try:
        messages = [
            {"role": "system", "content": MULTI_INFER_PROMPT},
            {"role": "user", "content": all_tables},
        ]
        resp = _call_llm(messages)
        content = resp.get("message", {}).get("content", "")

        # 剥离 think 标签
        prev = None
        while prev != content:
            prev = content
            content = re.sub(r'<think>[\s\S]*?</think>', '', content)
        content = re.sub(r'<think>[\s\S]*$', '', content).strip()

        parsed = _extract_json(content)
        if parsed and "tables" in parsed:
            return parsed
        return _fallback_infer_multi(tables)
    except Exception as e:
        print(f"[infer_schema_multi] LLM 失败: {e}")
        return _fallback_infer_multi(tables)


def _fallback_infer_multi(tables: list[dict]) -> dict:
    """LLM 不可用时的规则降级推断（多表版）"""
    result_tables = []
    for t in tables:
        fields = t.get("fields", [])
        field_ids = [f["fieldId"] for f in fields]

        # 找 ID 列（以 _id 结尾或等于表名_id）
        id_col = next((f for f in field_ids if f.endswith("_id") or f == "id"), field_ids[0] if field_ids else "id")
        # 找名称列
        name_col = next((f for f in field_ids if "_name" in f or "name" == f), id_col)

        # 属性 = 除了 id 和 name 以外的所有字段
        props = []
        for f in fields:
            if f["fieldId"] not in (id_col, name_col):
                props.append({
                    "csvColumn": f["fieldId"],
                    "propertyName": _to_camel(f["fieldId"]),
                    "type": f.get("dataType", "string"),
                })

        # 从文件名推断节点类型
        fname = t.get("filename", "")
        node_type = fname.split("(")[0].split("（")[0].strip()
        type_map = {
            "产品信息表": "Product", "客户信息表": "Customer",
            "销售订单表": "SalesOrder", "库存记录表": "InventoryRecord",
            "供应商信息表": "Supplier",
        }
        node_type = type_map.get(node_type, _to_camel(node_type).title())

        result_tables.append({
            "filename": fname,
            "nodeType": node_type,
            "label": t.get("tableDescription", node_type),
            "idColumn": id_col,
            "nameColumn": name_col,
            "tableCategory": "dimension" if "维度" in t.get("tableDescription", "") else "fact",
            "properties": props,
        })

    # 推断关系：找共享字段名
    relationships = []
    all_id_fields = {}
    for t in tables:
        for f in t.get("fields", []):
            fid = f["fieldId"]
            if fid.endswith("_id"):
                all_id_fields.setdefault(fid, []).append(t["filename"])

    for fid, fnames in all_id_fields.items():
        if len(fnames) >= 2:
            for i in range(len(fnames)):
                for j in range(len(fnames)):
                    if i != j:
                        from_fname = fnames[i].split("(")[0].split("（")[0].strip()
                        to_fname = fnames[j].split("(")[0].split("（")[0].strip()
                        type_map = {
                            "产品信息表": "Product", "客户信息表": "Customer",
                            "销售订单表": "SalesOrder", "库存记录表": "InventoryRecord",
                            "供应商信息表": "Supplier",
                        }
                        from_type = type_map.get(from_fname, from_fname)
                        to_type = type_map.get(to_fname, to_fname)
                        relationships.append({
                            "fromTable": fnames[i],
                            "fromColumn": fid,
                            "toTable": fnames[j],
                            "toColumn": fid,
                            "relationshipType": f"HAS_{fid.upper().replace('_ID', '')}",
                            "label": f"关联{to_fname}",
                        })

    return {
        "tables": result_tables,
        "relationships": relationships,
        "reasoning": f"LLM 不可用，使用规则推断。识别到 {len(result_tables)} 个节点类型，{len(relationships)} 条关系。请手动校准。",
    }
