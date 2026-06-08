# LLM Agent Setup

The Agent in Prompt to Ontology can operate in two modes: **LLM Tool Reasoning** and **Deterministic Fallback**. Both modes produce grounded answers using ontology tools — the difference is how the tool is selected and how the answer is composed.

---

## How It Works

### LLM Tool Reasoning (when LLM is configured)

```
User question
  → LLM selects tools
  → Tools query Neo4j graph
  → LLM composes grounded answer from tool results
```

The LLM never invents data. It selects which tools to call and composes the final answer, but all facts come from tool results.

### Deterministic Fallback (when LLM is not configured)

```
User question
  → Keyword router selects tools
  → Tools query Neo4j graph
  → Template generates answer from tool results
```

The keyword router maps question patterns to tools. The template formats the answer. No LLM is needed.

---

## Configuring LLM

The agent uses the existing LLM client. Set these environment variables:

### OpenAI-compatible backend

```bash
LLM_BACKEND=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

### MiniMax backend

```bash
LLM_BACKEND=minimax
MINIMAX_API_KEY=...
MINIMAX_MODEL=...
```

### No LLM (default fallback)

Leave all LLM environment variables unset. The agent will automatically use the deterministic fallback.

---

## UI-Based Runtime Configuration

You can also configure the LLM from the Agent tab in the UI:

1. Open the Agent tab
2. Click "Configure LLM" in the top bar
3. Select a provider (OpenAI, MiniMax, Anthropic, OpenAI-compatible)
4. Enter your API key, model, and base URL
5. Click "Save" to store the config in backend memory
6. Click "Test Connection" to verify the key works

### Priority Order

1. **Runtime UI config** (highest priority) — set from the Agent tab
2. **Environment variables** — set before backend starts
3. **Deterministic fallback** (lowest priority) — no LLM needed

### Deleting Runtime Config

Click "Delete Key" in the LLM Config panel to clear the runtime config. The agent will fall back to environment variables or deterministic mode.

### Security

- API keys are stored only in backend process memory
- Keys are never persisted to disk, database, or Git
- Keys are never stored in browser localStorage
- The UI only shows masked keys after saving
- Keys are cleared when the backend restarts

### Testing Connection

The "Test Connection" button sends a minimal request (`Say "ok"`) to verify:
- The API key is valid
- The model is accessible
- The endpoint is reachable

It reports success with latency, or a clear error (auth_error, timeout, provider_error).

---

## Running Without LLM

The agent works fully without an LLM configured. The deterministic fallback:

1. Matches question keywords to tool names
2. Executes the selected tools against the Neo4j graph
3. Generates a structured markdown answer using templates

Supported question patterns without LLM:
- "Which products contain chicken?"
- "Which cat foods are missing taurine?"
- "Compare PF001 and PF003"
- "Which products are high risk?"
- "Which products avoid chicken?"

---

## Agent Permissions

### The Agent Is Allowed To

- Query product properties from the graph
- Query ingredient relationships
- Query rule evaluations (triggered/passed/not_evaluable/not_applicable)
- Query risk edges and evidence
- Compare products
- Recommend alternatives
- Report data limitations when rules cannot be evaluated

### The Agent Must Not Do

- Provide veterinary diagnosis
- Claim a product treats or prevents diseases
- Invent product data, ingredients, or rules not in the graph
- Hide data limitations
- Make safety claims when data is insufficient

---

## Tools

| Tool | Purpose |
|---|---|
| `get_product_risk_explanation` | Full risk explanation for a product |
| `get_product_rule_evaluations` | 4-state rule evaluation report |
| `find_products_by_ingredient` | Products containing an ingredient |
| `find_products_without_ingredient` | Products without an ingredient |
| `find_products_by_species` | Products for a species |
| `find_high_risk_products` | All products with triggered risks |
| `find_products_with_not_evaluable_rules` | Products with missing data |
| `compare_products` | Side-by-side product comparison |
| `recommend_alternatives` | Risk-free alternatives |
| `find_cat_foods_missing_taurine` | Cat foods triggering RR002 |

---

## Verification

To verify the agent is working:

```bash
# Run smoke test
python scripts/smoke_test.py

# Test a specific question
curl -X POST http://localhost:8765/api/pet-food/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{"question": "Which products contain chicken?"}'
```

The response includes:
- `answer` — structured markdown with Conclusion, Graph Evidence, Rule Evaluation, Tools Used, Note
- `tools_used` — list of tools that were called
- `llm_used` — true if LLM was used, false if deterministic fallback
