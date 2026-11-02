# Product screenshots and demo

Captured on **2026-11-02** from **v0.6.0** in the light theme. The video follows one small assisted import through review, application, verification, and an actual DeepSeek query about the imported data.

## Current demo

https://github.com/user-attachments/assets/cb35e078-3699-43fc-94d3-1f6bfcd70766

[Download product highlights — 1:43, 1080p](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/releases/download/v0.6.0/prompt-to-ontology-v0.6.0-demo.mp4)

The 103.2-second MP4 uses H.264 video at 1920 × 1080, 30 fps, and AAC instrumental music. Short English captions sit above the actual application viewport. There is no synthetic narration. Navigation, idle time, and four repetitive approvals are cut; several real frames are held for readability. The opening graph is a result teaser. The goal/upload close-up is a second take using the same inputs, joined to the original successful model run. Application content and model outputs are not fabricated or replaced.

### What the recording demonstrates

- The [three source files](recording-sample/) add **PF101** (Harbor Cat Chicken Recipe), **ING101** (chicken), **ING102** (brown rice), and two `CONTAINS` relationships to an already seeded Pet Food graph. This is an incremental import, not an empty-graph rebuild.
- The assisted-build run calls DeepSeek against the existing ontology. Its proposal omitted the optional `ingredient_order` property; the recording shows the human mapping correction before confirmation.
- All five candidates are approved through Review Queue and applied. The runtime verification returns `applied: true`, `graph_matched: true`, and `status: matched`, finding all three expected objects and both relationships.
- The typed question is **“Which ingredients are in PF101? Show the supporting relationships.”** The recorded response reports `planner_llm_used: true` and `answer_llm_used: true`, provider `deepseek`, model `deepseek-flash`, and the actual tool `get_product_risk_explanation`.
- The answer returns chicken and brown rice, with two supporting runtime relationships. The path view opens Graph Explorer, which independently reports a matching relationship. These returned relationships are not original file-row or document citations. The video makes no food-safety or general Agent-accuracy claim.

The recording uses an isolated, disposable Docker stack, synthetic source files, and a privately configured backend key. It does not reset the regular acceptance environment or capture credentials. Raw recordings, runtime state, and full API responses remain outside Git history.

| Start | Scene |
| --- | --- |
| 0:00 | Explore the graph |
| 0:05 | Describe the goal and upload sources |
| 0:15 | DeepSeek mapping proposal |
| 0:25 | Human relationship-mapping correction |
| 0:32 | Preview candidate changes |
| 0:38 | Submit for review |
| 0:42 | Inspect and approve a candidate |
| 0:52 | Apply the approved batch |
| 0:58 | Verify against the runtime graph |
| 1:02 | Ask the Analyst Agent about PF101 |
| 1:11 | Inspect the answer, tool call, and model run |
| 1:25 | Follow the returned relationship path |
| 1:32 | Check the runtime relationship |
| 1:38 | Explore the code and music credit |

### Music credit

“[Inspired](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600022)” — Kevin MacLeod ([incompetech.com](https://incompetech.com/)). Licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

The track is a 103.2-second excerpt with fades and loudness adjustment. This credit also appears in the end card. The third-party music retains its CC BY 4.0 license; the repository's MIT license does not replace it. The video binary is hosted as a GitHub video attachment and a Release asset, outside Git history.

## Screenshots

All screenshots are unretouched captures of the actual 1600 × 900 application viewport. The fixed reference test is separate from the live Agent query.

| File | Captured state |
| --- | --- |
| `dashboard.png` | Seeded graph before the incremental import |
| `build-sources.png` | Goal and three uploaded source files |
| `data-profile.png` | Source field profiles in assisted build |
| `data-pipeline.png` | Product source-to-ontology mappings |
| `build-preview.png` | Three object candidates and two relationship candidates |
| `build-verified.png` | Applied import matched against the runtime graph |
| `review-queue.png` | Pending PF101 candidate in the detail drawer |
| `ontology-manager.png` | PetFoodProduct definition drawer |
| `graph.png` | Runtime graph overview after the incremental import |
| `verified-questions.png` | Fixed Q03 reference answer and checked-in CSV evidence |
| `graph-evidence.png` | PF101 neighborhood and matching runtime relationship |
| `analyst-agent.png` | Actual DeepSeek answer about PF101's ingredients |
| `query-tools.png` | Recorded query tool and arguments |
| `query-model.png` | Run details, provider, and model |
| `query-evidence.png` | React Flow path for the returned relationship |
| `demo-poster.png` | Actual Graph Explorer frame for sharing |

## Refresh the captures

1. Start an isolated stack from the version being demonstrated. Use English, the light theme, and a 1600 × 900 viewport. Configure the backend privately and keep keys and model configuration forms out of captures.
2. Capture Dashboard before importing. Upload the three files in `recording-sample/` and enter the build goal: “Connect this cat food to its ingredients, then help me inspect the recipe.” Inspect the actual model proposal; resolve missing or ambiguous mappings rather than hiding them.
3. Confirm mappings and inspect the preview. Submit the plan to Review Queue, inspect each candidate, approve the five changes, and apply the batch. Verify that the expected objects and relationships match Neo4j. Preserve the distinction between submission, approval, application, and graph verification.
4. Ask the PF101 question above through the Analyst Agent. Confirm the response's planner/answer model flags, inspect the recorded tool and returned relationships, and open the path in Graph Explorer. A fallback run must be labeled as a fallback, not as a live model result.
5. Separately capture the PetFoodProduct definition drawer and Q03 reference test. Wait for the Q03 answer to include `ING001 is first`; its checked-in CSV evidence is separate from the runtime Agent evidence.
6. Edit the real captures into a video shorter than two minutes. Use brief captions and restrained music; remove idle time and redundant actions. Check every cut for leftover recording overlays, errors, stale UI, and secrets. Decode the complete final file, inspect its frames and audio level, and check duration, codecs, dimensions, and size.
7. Refresh both READMEs, the screenshots, poster, capture metadata, and chapter times together. Verify public playback and download after publishing.

### Publish the inline player

Use a GitHub CLI version that supports native attachments (`gh pr create --help` must list `--attach`; this refresh used **2.103.3**). Upload the finished MP4 with a normal PR body, for example:

```bash
gh pr create --title 'docs: refresh product demo' \
  --body-file /tmp/demo-pr.md \
  --attach /absolute/path/to/prompt-to-ontology-v0.6.0-demo.mp4
```

Copy the returned `https://github.com/user-attachments/assets/...` URL into a standalone paragraph immediately below the title in both READMEs. GitHub renders a native video player. Keep a Release asset as the MP4 download fallback; append an asset only when the existing release permits it, and never move an existing release tag to publish media. If an attachment command reports a partial failure, inspect the PR before retrying so it is not duplicated.

This is a documentation/media change with release impact **None**. It does not require a new product version. CI and branch protection still apply to the PR.
