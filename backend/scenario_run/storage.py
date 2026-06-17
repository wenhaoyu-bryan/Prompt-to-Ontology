import json, logging, os
from pathlib import Path
from .models import ScenarioRun

logger = logging.getLogger(__name__)

RUNTIME_DIR = Path(__file__).parent.parent / ".runtime"
RUNS_FILE = RUNTIME_DIR / "scenario_runs.json"

def _ensure_dir():
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

def load_runs() -> list[ScenarioRun]:
    _ensure_dir()
    if not RUNS_FILE.exists():
        return []
    try:
        data = json.loads(RUNS_FILE.read_text(encoding="utf-8"))
        return [ScenarioRun(**r) for r in data]
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("Failed to load scenario runs from %s: %s", RUNS_FILE, e)
        return []

def save_runs(runs: list[ScenarioRun]):
    _ensure_dir()
    RUNS_FILE.write_text(json.dumps([r.model_dump(mode="json") for r in runs], indent=2, ensure_ascii=False), encoding="utf-8")
