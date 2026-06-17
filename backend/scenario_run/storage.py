import json, os
from pathlib import Path
from .models import ScenarioRun

RUNTIME_DIR = Path(__file__).parent.parent / ".runtime"
RUNS_FILE = RUNTIME_DIR / "scenario_runs.json"

def _ensure_dir():
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

def load_runs() -> list[ScenarioRun]:
    _ensure_dir()
    if not RUNS_FILE.exists():
        return []
    try:
        data = json.loads(RUNS_FILE.read_text())
        return [ScenarioRun(**r) for r in data]
    except Exception:
        return []

def save_runs(runs: list[ScenarioRun]):
    _ensure_dir()
    RUNS_FILE.write_text(json.dumps([r.model_dump() for r in runs], default=str, indent=2))
