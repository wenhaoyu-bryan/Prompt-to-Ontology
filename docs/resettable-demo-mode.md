# Resettable Demo Mode

## Why this exists

The project is now a mainline ontology runtime demo. Different visitors have different needs:

- **Reviewers / recruiters** want to see the completed ontology immediately (Seeded Demo Mode)
- **Developers / learners** want to build the ontology from scratch to understand the workflow (Clean Build Mode)

This feature makes the demo repeatable, resettable, and easy to explain.

---

## Seeded Demo Mode

The graph is pre-populated with the full Pet Food ontology:

- 12 products across 3 brands
- 20 ingredients with allergen and risk tagging
- 6 object types, 6 link types
- 5 risk rules with 4-state evaluation

**Demo path:**

```
Dashboard → Object Explorer → Graph Explorer → Agent Operator
```

The Review Queue is empty. The user can inspect objects, explore relationships, ask the agent questions, and see evidence-based risk evaluations.

---

## Clean Build Mode

The graph is empty. The user builds the ontology from scratch:

**Demo path:**

```
Settings → Reset to Clean Build Mode
→ Data Pipeline (select sample dataset)
→ Profile → Map to Ontology → Import Plan
→ Submit to Review Queue
→ Approve/Apply items
→ Object Explorer / Graph Explorer
```

This demonstrates the full Build Ontology path: data enters the graph only after human review.

---

## How to use

### From the Settings page

1. Open **Settings** from the sidebar
2. Find the **Demo Mode** card
3. Click **Refresh** to see current state
4. Click **Reset to Seeded Demo** or **Reset to Clean Build**
5. Confirm the action in the modal

### From the Dashboard

The Dashboard shows a small Demo State card with current mode, node count, and a shortcut to Settings.

### From the API

```bash
# Check current state
curl http://localhost:8765/api/demo/state

# Reset to seeded demo
curl -X POST http://localhost:8765/api/demo/reset \
  -H "Content-Type: application/json" \
  -d '{"mode": "seeded", "confirm": true}'

# Reset to clean build
curl -X POST http://localhost:8765/api/demo/reset \
  -H "Content-Type: application/json" \
  -d '{"mode": "clean", "confirm": true}'
```

---

## Safety guard

Reset endpoints are protected by the `DEMO_ADMIN_ENABLED` environment variable.

| Value | Behavior |
|---|---|
| `true` (default) | Reset endpoints are available |
| `false` or unset | Reset endpoints return HTTP 403 |

All reset actions require `"confirm": true` in the request body. Without it, the endpoint returns HTTP 400.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DEMO_ADMIN_ENABLED` | `true` | Enable demo reset endpoints |
| `AUTO_SEED_DEMO_DATA` | `true` | Auto-seed Pet Food data on startup if graph is empty |

Set `AUTO_SEED_DEMO_DATA=false` to start with an empty graph on first launch (Clean Build Mode by default).

---

## Known limitations

- Single-user demo (no multi-user auth)
- Graph reset deletes ALL nodes, not just Pet Food data
- No rollback for applied graph writes
- Pipeline state reset clears all import plans
- No scheduled or automatic reset
