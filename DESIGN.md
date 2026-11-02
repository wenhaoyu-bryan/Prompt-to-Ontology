# Prompt-to-Ontology design system

This is the implementation reference for the product UI. Keep it aligned with `frontend/src/providers/ThemeProvider.jsx`, `frontend/src/index.css`, and the shared workspace components. The direction is a restrained knowledge workbench: content before containers, explicit evidence before decoration.

## Principles

1. Put the user's current task and editable content in the first viewport. An explanation or diagram must not push the primary working list below the fold.
2. Use one strong action per stage. Navigation, secondary actions and advanced tools should have less visual weight.
3. Prefer typography, alignment, spacing and separators to nested cards. A card represents an independently actionable unit, not every paragraph.
4. Distinguish definitions from instances, drafts from active definitions, review from application, and observed facts from model proposals.
5. Keep operational status honest. No records, failed requests and unassessed results are distinct states. Never infer successful rules from an empty review queue or depict object counts as 100% health.

## Brand: ontology reasoning

![Ontology reasoning mark](frontend/public/brand/ontology-reasoning.png)

The open angular **O** describes a structured ontology. Two hollow circles represent observed premises. Their relation paths converge on one blue diamond, the derived conclusion. The path is the brand's identifying element.

- Main asset: `frontend/public/brand/ontology-reasoning.png`; generated with the built-in Image Gen tool. Source prompt and provenance are in the [brand notes](frontend/public/brand/README.md).
- Small browser asset: `frontend/public/brand/favicon.svg`; an optically simplified, code-native micro mark on white backing. The large generated master is unchanged.
- Use `AppLogo` in the sidebar and login. Sidebar size is 30 px; login size is 56 px. Keep a white contrast backing in dark mode.
- Keep aspect ratio and a clear margin. Never stretch, recolor individual nodes, add glow, animate the logo or combine it with a brain, robot, sparkle or pet icon.
- Product name is ordinary accessible text beside the mark, not baked into an image. Decorative repeated marks use an empty alt; the login mark has the product name.

## Color and theme

A fresh visit defaults to **light** in both initial HTML and React. An explicit saved dark preference survives navigation and reload. Update the initial HTML, `color-scheme`, browser theme color and React tokens together; avoid a flash of the wrong theme.

| Role | Light | Dark |
| --- | --- | --- |
| Content | `#FFFFFF` | `#191919` |
| Sidebar | `#F7F7F5` | `#202020` |
| Elevated/alternate surface | `#F7F7F5` | `#252525` |
| Primary text | `#37352F` | `#EDEDEB` |
| Secondary text | `#73726D` | `#B0AFAB` |
| Subtle divider | `#E9E9E7` | `#343432` |
| Functional accent | `#3267B1` | `#8BB4EA` |
| Primary action fill | `#37352F` | `#E0E0DC` |

Primary buttons are neutral filled controls. Use the functional accent for links, focus and active editing. Red, amber and green communicate actual error, pending/warning and confirmed-success states. Graph type colors may distinguish semantic types; do not turn every ordinary number into a colored badge. Existing optional accent preferences remain available; blue is the fresh default.

## Typography and spacing

Use the local system font stack; do not fetch display fonts. Product text must work in English and Chinese.

| Element | Treatment |
| --- | --- |
| Page title | 21–23 px, semibold, modest negative letter spacing |
| Section title | 14–16 px, semibold |
| Body and controls | 13–14 px |
| Supporting copy | 12–13 px; 11 px only for nonessential captions |
| Identifiers and JSON | Monospace, selectable and copyable; wrap or scroll without losing the full value |
| Numbers | Tabular figures in tables and comparisons |

Use a 4 px base with 8/12/16/20/24 px spacing. Controls use 4 px corners; independent surfaces use 6 px. Menus and popovers may use a restrained shadow; ordinary page sections do not. Avoid gradients, oversized welcome heroes and ornamental color washes.

## Shell and navigation

The desktop sidebar is 224 px, collapsed 64 px. Use the platform name and “Ontology & reasoning” in the brand area; Pet Food is a reference domain, not the platform identity. The global header is 48 px with a `Prompt-to-Ontology / current page` breadcrumb. Daily tasks remain visible; governance/debug tools are grouped but available and automatically expanded on their routes. Model configuration, demo resources and settings stay discoverable in Resources.

On mobile use the navigation drawer, readable labels and reduced padding. Preserve every existing route and do not make access depend on hover alone.

## Build workflows

The default `/pipeline` opens assisted import. Shared `BuildNavigation` exposes:

| Task | Route | Outcome |
| --- | --- | --- |
| Import data | `/pipeline?mode=assisted` | Candidate import, explicit review submission, runtime verification |
| Design schema draft | `/pipeline?mode=schema` | Reviewed definition draft and export; not runtime activation |
| Manual configuration | `/pipeline?mode=manual` | Existing six-stage manual import |

Keep the title, mode navigation, compact stepper and bottom action bar visible. Only stage content scrolls. Use the shared workspace height rather than independent viewport constants. At narrow widths, allow local table/stepper scrolling without page-wide overflow.

Schema calibration defaults to the **definition list**. The structure map is an explicit alternate view. Both open the same editing drawer; changing view does not change definitions or confirmations. Do not hide pending decisions, stale previews or unsaved edits. Existing revision/hash/schema guards remain mandatory; late responses must not overwrite another task after navigation.

## Components

Model configuration uses a flat list of reusable connections and one explicit selector per Agent. Assisted import and schema design share the build binding; query and evaluations share the query binding. Selectors save immediately and affect new runs. Page and workspace drawers use the same settings component. Edit a connection in a right drawer; show protocol, base URL, exact model ID and a write-only key field. Never prefill the masked key as a real secret. Changing protocol or URL requires the key again. Connectivity success must not imply full tool-workflow verification.

- **Headings:** `.page-heading`, with title/supporting line and a restrained action group. No extra hero card.
- **Sections:** `.page-section` and fine separators. Use `.quiet-panel` only when a bounded surface helps the task.
- **Metrics:** `.stat-strip` and semantic `.stat-item` buttons; show counts as counts and unknown values as `—`.
- **Tables:** compact rows, clear names, secondary IDs, selective type/status markers. Put filters in `.workspace-toolbar`. Keep names readable on mobile; move less-used columns into the detail view.
- **Details:** right-hand drawer with clear view/edit state, stable identity, labeled fields and explicit save/cancel. A row, name and detail action must lead to the same entity.
- **Maps:** Sigma/Graphology for runtime exploration; React Flow for definition/evidence paths. Preserve semantics, source context, keyboard alternatives and meaningful empty states.
- **Empty states:** say what is missing and offer the next action. Do not fill an unrun evaluation with a success score or treat no risk links as proof of a completed assessment.
- **Information:** contextual help or neutral inline notes. Reserve prominent alerts for a condition the user needs to handle now.

## Icons and copy

Use the existing Ant Design line icons, normally 14–16 px and monochrome. Remove decorative emoji from application chrome, type filters, source choices, row labels and favicon. Do not strip emoji out of user-provided source values or historical records.

Icon-only controls need accessible names. Filters and selectable source tiles need real button semantics, keyboard activation and a visible selected state. Keep hover and focus treatments distinct. Respect reduced motion and retain visible focus around sticky controls.

Localize operating copy through the existing locale system or established bilingual workspace helper. Original schema names, IDs and source columns may remain literal. Prefer specific verbs: confirm mapping, preview changes, save draft, submit for review, apply approved changes. Do not use publish/apply/import interchangeably.

## Verification before shipping

- Fresh light, saved dark, no-JavaScript background, navigation and reload agree.
- Logo loads locally, remains recognizable at sidebar/favicon sizes and has contrast in both themes.
- No decorative emoji remain on active routes.
- Desktop and narrow viewport checks cover overflow, name wrapping, fixed workflow controls and drawer visibility.
- Keyboard source selection and type filters work; one global main landmark and clear labels remain.
- Empty review state, failed fetches, unrun evaluations and draft definitions communicate their actual state.
- Run production build and the browser suite against a disposable database. Never run graph reset/import regression against the acceptance preview.
- New behavior changes the existing tests intentionally; do not weaken checks to hide regressions.
