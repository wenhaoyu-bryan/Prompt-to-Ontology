# Contribute to Prompt-to-Ontology

[中文指南](CONTRIBUTING.zh-CN.md)

This guide covers changes to the runnable Pet Food reference implementation. Start with an [issue](https://github.com/wenhaoyu-bryan/Prompt-to-Ontology/issues) for a larger feature or an unclear behavior. For a small fix, open a focused pull request (PR) directly.

## Run the demo

Install Git and Docker with Compose v2. Clone the repository, then start the stack:

```bash
git clone https://github.com/wenhaoyu-bryan/Prompt-to-Ontology.git
cd Prompt-to-Ontology
cp .env.example .env
docker compose up --build --wait -d
```

Open <http://localhost:5173> and sign in with `demo` / `demo`. The backend API is at <http://localhost:8765>. The Pet Food sample loads on first startup. You do not need an LLM key for the deterministic demo path. For port or startup issues, use the [Docker setup guide](docs/local-docker-setup.md).

Stop the containers with `docker compose down`. This keeps the named data volumes for your next run.

## Check your change

Run backend unit tests against the local Compose container:

```bash
docker compose exec -T backend python -m unittest discover -s tests
```

For frontend changes, use Node.js 20, install dependencies, and run the build and browser smoke tests. Keep the demo stack running while Playwright tests execute:

```bash
cd frontend
npm ci
npm run build
npx playwright install chromium
npm run test:smoke -- --workers=1
```

The browser tests use <http://localhost:5173> by default. If you changed `FRONTEND_PORT`, set `PLAYWRIGHT_BASE_URL` to the matching URL. For backend module or Neo4j integration changes, add focused tests; the PR pipeline runs the full checks in a disposable environment.

## Open a pull request

1. Create a branch from the latest `main` and keep the PR focused on one change.
2. Explain the behavior, how you checked it, and any limitation. Include a screenshot or short recording for visible UI changes.
3. Update the English and Chinese text together when you change shared product wording.
4. Select exactly one **release impact** checkbox in the PR template: None for docs/tests/internal work, Patch for compatible fixes, or Minor for new capabilities and `0.x` compatibility changes. Explain migrations when behavior or data contracts change.
5. Wait for **Backend module checks**, **Neo4j integration checks**, **Frontend build**, and **Playwright UI smoke**. All four must pass on the current PR revision, and the branch must be up to date with `main` before merging.

Do not change `VERSION` or frontend package versions in a feature PR. After feature PRs merge, automation proposes a separate version PR based on the highest release impact since the latest tag. See the [release process](docs/releasing.md).

Keep sample data public or synthetic. Do not commit API keys, `.env`, private company material, or claims of production readiness that the tests do not establish. This repository validates the Pet Food reference workflow; contributions should state the evidence for any broader claim.
