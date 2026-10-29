# Product screenshots and demo

Captured on **2026-10-29** from the local Pet Food demo for **v0.3.1**. The app defaults to dark mode; all nine README screenshots and every demo scene use that theme. Existing explicit light preferences remain available to users.

## Screenshots

The PNGs are actual viewport captures, at 1600 × 1000 CSS pixels except the 1600 × 1100 dashboard. Screenshots and video come from isolated runs of the same bundled scenario. The recording used a temporary demo stack so it did not reset the regular local environment. Screenshots do not include the video's chapter cards.

| File | Captured state |
| --- | --- |
| `dashboard.png` | Seeded graph at the beginning of the demo, before review items are created |
| `data-profile.png` | Data Pipeline step 2: product source column profiles |
| `data-pipeline.png` | Step 3: source mapping suggestions and decision controls |
| `review-queue.png` | Full-build candidates pending review, PF001 detail drawer |
| `ontology-manager.png` | PetFoodProduct definition drawer with Edit draft |
| `graph.png` | Simplified runtime overview with 46 objects and 56 of 116 relationships |
| `verified-questions.png` | Q03 answer, React Flow path, and cited source records |
| `graph-evidence.png` | PF001 neighborhood and matching CONTAINS relationship |
| `analyst-agent.png` | Deterministic answer to “Which products contain chicken?” |
| `demo-poster.png` | Title card extracted from the current demo video |

## Current demo

[MP4 (3:30)](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/releases/download/v0.3.1/pet-food-dark-demo.mp4) · [English SRT](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/releases/download/v0.3.1/pet-food-dark-demo.en.srt)

The MP4 contains 1280 × 800 H.264 video, AAC narration, English subtitles, and chapter metadata. The narration is a synthetic system voice. It uses no music. Only the completed UI scenes are retained; idle command waits are removed. The large video and subtitle download live as GitHub Release assets, rather than in Git history.

| Start | Chapter |
| --- | --- |
| 0:02 | Prompt-to-Ontology |
| 0:20 | Profile and map a source |
| 0:39 | Prepare a build plan |
| 1:01 | Review before applying |
| 1:25 | Inspect the ontology contract |
| 1:46 | Explore the graph |
| 2:11 | Trace an answer to its source |
| 2:36 | Inspect executable rules |
| 2:57 | Ask through ontology tools |
| 3:15 | Explore the reference |

## Refresh the captures

1. Start an isolated Pet Food demo with seeded sample data. Sign in with `demo` / `demo`, use English and dark mode, and keep credentials and model configuration out of captures.
2. Capture Dashboard before creating review items. In Data Pipeline, select `pet_food_products`, inspect Profile Data, then Map to Ontology. Capture after data and transitions settle. This source alone can report missing Brand primary keys; the full-build example is a separate multi-source path.
3. Open Full build demo, create the four-source plan, inspect its validation summary, and submit it to Review Queue. Capture PF001's pending candidate drawer. For the video, approve and apply that one product, then show it in the Applied tab. Leave the remaining candidates pending. The graph was already seeded; this is not a clean full-graph rebuild.
4. Capture the PetFoodProduct definition drawer. Inspect an Action contract without saving a draft or changing the active YAML.
5. Capture Graph Explorer's simplified overview, then exercise all links, object search, and object properties.
6. Run Q03 in Verified Questions. Capture the answer, evidence path, and source table. Use Explore in graph, capture PF001's neighborhood, and inspect a cited source record.
7. Inspect the four rule evaluation states. Ask the Analyst Agent “Which products contain chicken?” in deterministic fallback mode and capture the answer and tool name.
8. Verify dark mode in each scene, inspect the full encoded video for decoding errors, check narration/caption timing, and confirm that every published asset can be downloaded. Update both README files, screenshots, poster, and these chapter times together.

Q03 reads checked-in CSV files. Graph Explorer separately checks for matching runtime relationships. Schema drafts do not change checked-in definitions or graph data. The video demonstrates those boundaries rather than claiming production readiness or free-form Agent accuracy.
