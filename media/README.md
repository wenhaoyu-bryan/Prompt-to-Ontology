# Product screenshots

These PNGs are actual browser captures for the English and Chinese README walkthroughs.

Captured on **2026-10-29** from the local Pet Food demo with the UI released in **v0.3.0**. One signed-in English desktop session uses the bundled sample data. Captures are 1600 × 1000 CSS pixels, except the 1600 × 1100 dashboard. The overview demonstrates dark mode; the other views use light mode. Images are unmodified viewport captures.

| File | Route / captured state |
| --- | --- |
| `dashboard.png` | `/dashboard`: seeded graph and the current review summary |
| `data-profile.png` | `/pipeline`: step 2, product source column profiles |
| `data-pipeline.png` | `/pipeline`: step 3, source mapping suggestions and decisions |
| `review-queue.png` | `/review`: full-build candidates pending review, PF001 detail drawer |
| `ontology-manager.png` | `/schema`: PetFoodProduct definition drawer with Edit draft |
| `graph.png` | `/graph`: dark-mode simplified overview, 46 objects and 56 of 116 relationships |
| `verified-questions.png` | `/verified-qa`: Q03 answer, React Flow path, and cited source records |
| `graph-evidence.png` | `/graph?question=Q03`: PF001 neighborhood and matching CONTAINS relationship |
| `analyst-agent.png` | `/agent`: deterministic fallback answer to “Which products contain chicken?” |

## Refresh the same session

1. Start the demo stack, sign in with `demo` / `demo`, and use the English UI. Keep credentials and configuration dialogs out of captures.
2. In Data Pipeline, select `pet_food_products`, advance to Profile Data, then Map to Ontology. Capture each step after data and transitions settle. Keep validation issues visible when demonstrating them; this single source can report missing Brand primary keys and is not the full-build success path.
3. Open **Full build demo**, create the four-source plan, inspect its validation summary, and submit it to Review Queue. Open the PF001 candidate drawer. Leave it pending for these captures; the existing graph comes from the seeded demo, not from applying this plan.
4. Open Ontology Manager → Object Types → PetFoodProduct → View details. Capture the drawer without saving a draft.
5. Run Q03 in Verified Questions. Scroll to the read-only answer so its conclusion, evidence path, and source records are visible. Use **Explore in graph** to inspect PF001 and open a cited source record before capturing the focused view.
6. Open `/graph` without a question parameter, switch to Overview, and use dark mode for the overview capture. Keep the relationship counter and simplified-overview label visible.
7. Switch back to light mode. In Analyst Agent, ask “Which products contain chicken?” using deterministic fallback; capture the completed answer and tool name. Capture Dashboard after the session's review state has loaded.
8. Inspect every image for loading indicators, transient messages, clipped headings, and sensitive data. Replace the matching files and update both README walkthroughs together.

Q03 answers read the checked-in CSV files. Graph Explorer separately checks the runtime graph for matching relationships. The screenshots do not turn the sample reader into a Neo4j-backed question-answering engine.

The linked demo video in the main README is an earlier recording and predates these interactions.
