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
| `demo-poster.png` | Editorial demo cover using a real Graph Explorer frame |

## Current demo

[Product highlights — 1:36, 1080p](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/releases/download/v0.3.1/prompt-to-ontology-product-demo.mp4)

The current edit opens on Graph Explorer and cuts between source profiling, field mapping, build plans, review, schema inspection, Q03 evidence, rule states, and an ontology-tool query. It removes the long chapter cards, waiting, repeated navigation, and synthetic narration from the earlier tour. Short English editorial captions sit beside the full captured application viewport; no application data is invented. The MP4 has H.264 video, AAC music, and chapter metadata. Text is part of the picture, so it does not need a separate subtitle file.

| Start | Chapter |
| --- | --- |
| 0:00 | Explore the graph |
| 0:08 | Profile and map |
| 0:32 | Review before applying |
| 0:48 | Inspect the ontology contract |
| 0:55 | Follow an answer to its source |
| 1:17 | Ask through ontology tools |
| 1:32 | Explore the code |

### Music credit

“[Inspired](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600022)” — Kevin MacLeod ([incompetech.com](https://incompetech.com/)). Licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

The track was trimmed to a 96-second excerpt, faded in and out, and loudness-normalized. This credit also appears in the video end card. The third-party music retains its CC BY 4.0 license; the repository's MIT license does not replace it. The large MP4 is hosted as a release asset, outside Git history.

## Refresh the captures

1. Start an isolated Pet Food demo with seeded sample data. Sign in with `demo` / `demo`, use English and dark mode, and keep credentials and model configuration out of captures.
2. Capture Dashboard before creating review items. In Data Pipeline, select `pet_food_products`, inspect Profile Data, then Map to Ontology. Capture after data and transitions settle. This source alone can report missing Brand primary keys; the full-build example is a separate multi-source path.
3. Open Full build demo, create the four-source plan, inspect its validation summary, and submit it to Review Queue. Capture PF001's pending candidate drawer. For the video, approve and apply that one product, then show it in the Applied tab. Leave the remaining candidates pending. The graph was already seeded; this is not a clean full-graph rebuild.
4. Capture the PetFoodProduct definition drawer. Inspect an Action contract without saving a draft or changing the active YAML.
5. Capture Graph Explorer's simplified overview, then exercise all links, object search, and object properties.
6. Run Q03 in Verified Questions. Capture the answer, evidence path, and source table. Use Explore in graph, capture PF001's neighborhood, and inspect a cited source record.
7. Inspect the four rule evaluation states. Ask the Analyst Agent “Which products contain chicken?” in deterministic fallback mode and capture the answer and tool name.
8. Verify dark mode in each scene, inspect the full encoded video for decoding errors, check caption timing, pacing, music level, and attribution, and confirm that every published asset can be downloaded. Update both README files, screenshots, poster, and these chapter times together.

### Publish the inline player

Upload the finished MP4 as a GitHub video attachment, for example with GitHub CLI's `gh pr create --attach /absolute/path/to/demo.mp4` alongside the normal PR title and body. Copy the generated `https://github.com/user-attachments/assets/...` URL into a standalone paragraph immediately below the title in both README files. GitHub renders that attachment as a video player. Keep the Release MP4 link as a download fallback, and keep the video binary outside Git history.

Q03 reads checked-in CSV files. Graph Explorer separately checks for matching runtime relationships. Schema drafts do not change checked-in definitions or graph data. The video demonstrates those boundaries rather than claiming production readiness or free-form Agent accuracy.
