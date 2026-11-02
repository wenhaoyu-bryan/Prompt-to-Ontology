"""
LLM Runtime Configuration Manager.

Manages runtime LLM config (from UI) and environment config.
Runtime config takes priority over environment variables.
Named connection keys are persisted in a server-only file and never returned unmasked.
"""

import os
import time
import json
import tempfile
import threading
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from contextlib import contextmanager
from contextvars import ContextVar

# In-memory runtime config (cleared on backend restart)
_runtime_config: dict = {}
_query_config = ContextVar("llm_query_config", default=None)


@contextmanager
def llm_config_scope(config: dict):
    """Keep one query/batch on its captured configuration; never persist the key."""
    token = _query_config.set(dict(config))
    try:
        yield
    finally:
        _query_config.reset(token)


# Default base URLs per provider
_DEFAULTS = {
    "openai": {"base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
    "minimax": {"base_url": "https://api.minimaxi.com/v1", "model": "MiniMax-M2.7"},
    "anthropic": {"base_url": "https://api.anthropic.com", "model": "claude-sonnet-4"},
    "openai_compatible": {"base_url": "", "model": ""},
    "deepseek": {"base_url": "https://api.deepseek.com", "model": "deepseek-flash"},
}


def mask_api_key(api_key: str | None) -> str | None:
    """Fixed-length masked key: prefix + 8 dots + last 4 chars."""
    if not api_key:
        return None
    if len(api_key) <= 8:
        return "••••"
    prefix = api_key[:3]
    suffix = api_key[-4:]
    return f"{prefix}••••••••{suffix}"


def _build_status(
    configured,
    source,
    provider=None,
    model=None,
    base_url=None,
    key_masked=None,
    editable=False,
    deletable=False,
    message="",
):
    return {
        "configured": configured,
        "source": source,
        "provider": provider,
        "model": model,
        "base_url": base_url,
        "key_masked": key_masked,
        "editable": editable,
        "deletable": deletable,
        "message": message,
    }


def set_runtime_llm_config(config: dict) -> dict:
    """Save runtime LLM config. Returns masked config."""
    provider = config.get("provider", "")
    api_key = config.get("api_key", "")
    model = config.get("model", "")
    base_url = config.get("base_url", "")

    if not provider:
        raise ValueError("provider is required")
    if not api_key:
        raise ValueError("api_key is required")
    if not model:
        raise ValueError("model is required")

    defaults = _DEFAULTS.get(provider, {})
    if not base_url and defaults.get("base_url"):
        base_url = defaults["base_url"]

    _runtime_config.clear()
    _runtime_config.update(
        {
            "provider": provider,
            "api_key": api_key,
            "model": model,
            "base_url": base_url,
            "source": "runtime",
        }
    )

    return get_active_status()


def get_runtime_llm_config() -> dict | None:
    """Return masked runtime config, or None if not set."""
    if not _runtime_config:
        return None
    return _build_status(
        configured=True,
        source="runtime",
        provider=_runtime_config.get("provider"),
        model=_runtime_config.get("model"),
        base_url=_runtime_config.get("base_url"),
        key_masked=mask_api_key(_runtime_config.get("api_key")),
        editable=True,
        deletable=True,
        message="LLM is configured for this backend session.",
    )


def clear_runtime_llm_config() -> dict:
    """Clear runtime config only. Returns appropriate status."""
    had_runtime = bool(_runtime_config)
    _runtime_config.clear()

    env = get_env_llm_config()
    if env.get("configured"):
        if had_runtime:
            return {
                "status": "cleared_runtime",
                "configured": True,
                "source": "environment",
                "message": "Runtime config cleared. Falling back to environment config.",
            }
        else:
            return {
                "status": "environment_not_deletable",
                "configured": True,
                "source": "environment",
                "message": "Environment config cannot be deleted from the UI. Remove it from backend environment variables.",
            }
    else:
        return {
            "status": "cleared_runtime" if had_runtime else "nothing_to_clear",
            "configured": False,
            "source": "none",
            "message": (
                "Runtime config cleared. No LLM config found."
                if had_runtime
                else "No LLM config found. Agent will use deterministic fallback."
            ),
        }


def get_env_llm_config() -> dict:
    """Return environment-based LLM config status."""
    backend = os.environ.get("LLM_BACKEND", "none")
    if backend == "deepseek":
        key = os.environ.get("DEEPSEEK_API_KEY", "")
        return _build_status(
            configured=bool(key),
            source="environment",
            provider="deepseek",
            model=os.environ.get("DEEPSEEK_MODEL", _DEFAULTS["deepseek"]["model"]),
            base_url=os.environ.get(
                "DEEPSEEK_BASE_URL", _DEFAULTS["deepseek"]["base_url"]
            ),
            key_masked=mask_api_key(key),
            editable=True,
            deletable=False,
            message=(
                "DeepSeek is configured through backend environment variables."
                if key
                else "No DeepSeek key configured."
            ),
        )
    if backend in ("openai", "openai_compatible"):
        key = os.environ.get("OPENAI_API_KEY", "")
        return _build_status(
            configured=bool(key),
            source="environment",
            provider=backend,
            model=os.environ.get("OPENAI_MODEL", "gpt-4o"),
            base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            key_masked=mask_api_key(key) if key else None,
            editable=True,
            deletable=False,
            message=(
                "LLM is configured through backend environment variables."
                if key
                else "No LLM config found. Agent will use deterministic fallback."
            ),
        )
    elif backend == "minimax":
        key = os.environ.get("MINIMAX_API_KEY", "")
        return _build_status(
            configured=bool(key),
            source="environment",
            provider="minimax",
            model=os.environ.get("MINIMAX_MODEL", "MiniMax-M2.7"),
            base_url=os.environ.get("MINIMAX_BASE_URL", "https://api.minimaxi.com/v1"),
            key_masked=mask_api_key(key) if key else None,
            editable=True,
            deletable=False,
            message=(
                "LLM is configured through backend environment variables."
                if key
                else "No LLM config found. Agent will use deterministic fallback."
            ),
        )
    elif backend == "anthropic":
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        return _build_status(
            configured=bool(key),
            source="environment",
            provider="anthropic",
            model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4"),
            base_url=normalize_url(
                os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
                "anthropic",
            ),
            key_masked=mask_api_key(key) if key else None,
            editable=True,
            deletable=False,
            message=(
                "LLM is configured through backend environment variables."
                if key
                else "No LLM config found. Agent will use deterministic fallback."
            ),
        )
    return _build_status(
        configured=False,
        source="none",
        provider=None,
        model=None,
        base_url=None,
        key_masked=None,
        editable=True,
        deletable=False,
        message="No LLM config found. Agent will use deterministic fallback.",
    )


def get_default_llm_config() -> dict:
    """Return the active config (runtime > env) with raw keys for internal use."""
    scoped = _query_config.get()
    if scoped is not None:
        return dict(scoped)
    if _runtime_config and _runtime_config.get("api_key"):
        return dict(_runtime_config)

    backend = os.environ.get("LLM_BACKEND", "none")
    if backend == "deepseek":
        return {
            "provider": "deepseek",
            "api_key": os.environ.get("DEEPSEEK_API_KEY", ""),
            "model": os.environ.get("DEEPSEEK_MODEL", _DEFAULTS["deepseek"]["model"]),
            "base_url": os.environ.get(
                "DEEPSEEK_BASE_URL", _DEFAULTS["deepseek"]["base_url"]
            ),
            "source": "environment",
        }
    if backend in ("openai", "openai_compatible"):
        return {
            "provider": backend,
            "api_key": os.environ.get("OPENAI_API_KEY", ""),
            "model": os.environ.get("OPENAI_MODEL", "gpt-4o"),
            "base_url": os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            "source": "environment",
        }
    elif backend == "minimax":
        return {
            "provider": "minimax",
            "api_key": os.environ.get("MINIMAX_API_KEY", ""),
            "model": os.environ.get("MINIMAX_MODEL", "MiniMax-M2.7"),
            "base_url": os.environ.get(
                "MINIMAX_BASE_URL", "https://api.minimaxi.com/v1"
            ),
            "source": "environment",
        }
    elif backend == "anthropic":
        return {
            "provider": "anthropic",
            "api_key": os.environ.get("ANTHROPIC_API_KEY", ""),
            "model": os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4"),
            "base_url": normalize_url(
                os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
                "anthropic",
            ),
            "source": "environment",
        }
    return {
        "provider": "none",
        "api_key": "",
        "model": "",
        "base_url": "",
        "source": "none",
    }


def get_active_llm_config() -> dict:
    return get_agent_llm_config("query")


def get_active_status() -> dict:
    """Return masked status of the active config."""
    scoped = _query_config.get()
    if scoped is None:
        scoped = get_agent_llm_config("query")
    if scoped is not None:
        return _build_status(
            configured=bool(scoped.get("api_key")),
            source=scoped.get("source", "runtime"),
            provider=scoped.get("provider"),
            model=scoped.get("model"),
            base_url=scoped.get("base_url"),
            key_masked=mask_api_key(scoped.get("api_key")),
        )
    if _runtime_config:
        return get_runtime_llm_config()
    env = get_env_llm_config()
    if env.get("configured"):
        return env
    return _build_status(
        configured=False,
        source="none",
        provider=None,
        model=None,
        base_url=None,
        key_masked=None,
        editable=True,
        deletable=False,
        message="No LLM config found. Agent will use deterministic fallback.",
    )


def is_llm_configured() -> bool:
    """Check if any LLM config is available."""
    scoped = _query_config.get()
    if scoped is not None:
        return bool(scoped.get("api_key"))
    return bool(get_active_llm_config().get("api_key"))


def test_llm_connection(config: dict | None = None) -> dict:
    """Test LLM connection with a minimal call."""
    testing_label = "active config"
    if config and config.get("api_key"):
        provider = config.get("provider", "")
        api_key = config.get("api_key", "")
        model = config.get("model", "")
        base_url = config.get("base_url", "")
        testing_label = "draft config"
    else:
        active = get_active_llm_config()
        provider = active.get("provider", "")
        api_key = active.get("api_key", "")
        model = active.get("model", "")
        base_url = active.get("base_url", "")
        source = active.get("source", "none")
        if source == "runtime":
            testing_label = "active runtime config"
        elif source == "environment":
            testing_label = "active environment config"
        else:
            testing_label = "no config"

    if not api_key:
        return {
            "ok": False,
            "error_type": "auth_error",
            "message": "No API key configured.",
            "testing": testing_label,
        }

    start = time.time()

    try:
        if provider == "anthropic":
            result = _test_anthropic(api_key, model, base_url, start)
        else:
            result = _test_openai_compat(api_key, model, base_url, provider, start)
        result["testing"] = testing_label
        return result
    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        err = str(e).lower()
        if "auth" in err or "401" in err or "403" in err:
            return {
                "ok": False,
                "error_type": "auth_error",
                "message": "Authentication failed. Check your API key.",
                "latency_ms": elapsed,
                "testing": testing_label,
            }
        elif "timeout" in err:
            return {
                "ok": False,
                "error_type": "timeout",
                "message": "Connection timed out.",
                "latency_ms": elapsed,
                "testing": testing_label,
            }
        else:
            return {
                "ok": False,
                "error_type": "provider_error",
                "message": "Connection failed. Check the provider configuration.",
                "latency_ms": elapsed,
                "testing": testing_label,
            }


def _test_openai_compat(
    api_key: str, model: str, base_url: str, provider: str, start: float
) -> dict:
    import requests

    if not base_url:
        if provider == "minimax":
            base_url = "https://api.minimaxi.com/v1"
        else:
            base_url = "https://api.openai.com/v1"

    body = {
        "model": model,
        "messages": [{"role": "user", "content": 'Say "ok".'}],
        "max_tokens": 16,
    }
    if provider == "deepseek":
        body["thinking"] = {"type": "disabled"}
    resp = requests.post(
        f"{base_url.rstrip('/')}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=30,
    )
    resp.raise_for_status()
    elapsed = int((time.time() - start) * 1000)
    return {
        "ok": True,
        "provider": provider,
        "model": model,
        "latency_ms": elapsed,
        "message": "Connection test succeeded.",
    }


def _test_anthropic(api_key: str, model: str, base_url: str, start: float) -> dict:
    import anthropic

    client = anthropic.Anthropic(
        api_key=api_key,
        base_url=normalize_url(base_url or "https://api.anthropic.com", "anthropic"),
        timeout=30.0,
    )
    resp = client.messages.create(
        model=model or "claude-sonnet-4-20250514",
        max_tokens=10,
        messages=[{"role": "user", "content": 'Say "ok".'}],
    )
    elapsed = int((time.time() - start) * 1000)
    return {
        "ok": True,
        "provider": "anthropic",
        "model": model,
        "latency_ms": elapsed,
        "message": "Connection test succeeded.",
    }


# Registry is loaded on demand; a process-local lock serializes read/modify/write.
_registry_lock = threading.RLock()


def normalize_url(value, provider):
    value = value.strip().rstrip("/")
    if any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError("base_url contains invalid whitespace or controls")
    parts = urlsplit(value)
    if (
        parts.scheme not in ("http", "https")
        or not parts.hostname
        or parts.username is not None
        or parts.password is not None
        or parts.query
        or parts.fragment
    ):
        raise ValueError(
            "base_url must be an HTTP(S) URL without credentials, query, or fragment"
        )
    try:
        parts.port
        hostname = parts.hostname
        if not hostname or any(
            c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-:"
            for c in hostname
        ):
            raise ValueError()
    except ValueError:
        raise ValueError("base_url has an invalid host or port") from None
    path = parts.path.rstrip("/")
    if provider == "anthropic" and path.endswith("/v1"):
        path = path[:-3]
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, "", ""))


def _path():
    return Path(
        os.environ.get(
            "LLM_CONNECTIONS_PATH",
            str(Path(__file__).parent / ".runtime" / "llm-connections.json"),
        )
    )


def _load():
    path = _path()
    if not path.exists():
        return {"connections": [], "bindings": {"build": None, "query": None}}
    try:
        data = json.loads(path.read_text())
        if (
            not isinstance(data, dict)
            or not isinstance(data.get("connections"), list)
            or not isinstance(data.get("bindings"), dict)
        ):
            raise ValueError()
        ids = set()
        for item in data["connections"]:
            if (
                not isinstance(item, dict)
                or any(
                    not isinstance(item.get(k), str) or not item[k]
                    for k in ("id", "name", "provider", "model", "base_url", "api_key")
                )
                or item["provider"] not in ("anthropic", "openai_compatible")
                or item["id"] in ids
            ):
                raise ValueError()
            normalize_url(item["base_url"], item["provider"])
            ids.add(item["id"])
        if set(data["bindings"]) != {"build", "query"} or any(
            v is not None and v not in ids for v in data["bindings"].values()
        ):
            raise ValueError()
        return data
    except (ValueError, TypeError, OSError):
        raise RuntimeError("Model connections file is invalid or unreadable.") from None


def _save(data):
    try:
        path = _path()
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".llm-connections-", dir=path.parent)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w") as out:
                json.dump(data, out)
                out.flush()
                os.fsync(out.fileno())
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
    except OSError:
        raise RuntimeError("Model connections file could not be saved.") from None


def _masked(item):
    return {k: item[k] for k in ("id", "name", "provider", "model", "base_url")} | {
        "key_masked": mask_api_key(item["api_key"])
    }


def _status(config):
    return _build_status(
        configured=bool(config.get("api_key")),
        source=config.get("source", "none"),
        provider=config.get("provider"),
        model=config.get("model"),
        base_url=config.get("base_url"),
        key_masked=mask_api_key(config.get("api_key")),
    )


def get_agent_llm_config(agent):
    scoped = _query_config.get()
    if scoped is not None:
        return dict(scoped)
    with _registry_lock:
        data = _load()
        selected = data["bindings"].get(agent)
        if selected:
            return dict(
                next(c for c in data["connections"] if c["id"] == selected),
                source="connection",
            )
    return get_default_llm_config()


def get_agent_status(agent):
    return _status(get_agent_llm_config(agent))


def connections_snapshot():
    with _registry_lock:
        data = _load()
        return {
            "connections": [_masked(c) for c in data["connections"]],
            "bindings": data["bindings"],
            "agents": {a: get_agent_status(a) for a in ("build", "query")},
            "default": _status(get_default_llm_config()),
        }


def _validate_profile(body, old=None):
    provider = body.get("provider", "")
    if provider not in ("anthropic", "openai_compatible"):
        raise ValueError("Unsupported provider")
    name = (body.get("name") or "").strip()
    model = (body.get("model") or "").strip()
    key = (body.get("api_key") or "").strip()
    if not name or not model:
        raise ValueError("name and model are required")
    if "•" in key or "*" in key:
        raise ValueError("A masked API key cannot be saved")
    base = normalize_url(
        body.get("base_url")
        or ("https://api.anthropic.com" if provider == "anthropic" else ""),
        provider,
    )
    if (
        not key
        and old
        and (
            provider != old["provider"]
            or base != normalize_url(old["base_url"], old["provider"])
        )
    ):
        raise ValueError("api_key is required when provider or base_url changes")
    key = key or (old or {}).get("api_key", "")
    if not key:
        raise ValueError("api_key is required")
    return {
        "id": (old or {}).get("id") or str(uuid.uuid4()),
        "name": name,
        "provider": provider,
        "model": model,
        "base_url": base,
        "api_key": key,
    }


def save_connection(body, ident=None):
    with _registry_lock:
        data = _load()
        old = (
            next((c for c in data["connections"] if c["id"] == ident), None)
            if ident
            else None
        )
        if ident and old is None:
            raise KeyError("Connection not found")
        new = _validate_profile(body, old)
        if old:
            data["connections"][data["connections"].index(old)] = new
        else:
            data["connections"].append(new)
        _save(data)
        return connections_snapshot()


def delete_connection(ident):
    with _registry_lock:
        data = _load()
        if not any(c["id"] == ident for c in data["connections"]):
            raise KeyError("Connection not found")
        if ident in data["bindings"].values():
            raise RuntimeError("Connection is bound to an agent")
        data["connections"] = [c for c in data["connections"] if c["id"] != ident]
        _save(data)
        return connections_snapshot()


def set_bindings(bindings):
    with _registry_lock:
        data = _load()
        ids = {c["id"] for c in data["connections"]}
        if set(bindings) != {"build", "query"} or any(
            v is not None and v not in ids for v in bindings.values()
        ):
            raise ValueError("Invalid model binding")
        data["bindings"] = dict(bindings)
        _save(data)
        return connections_snapshot()


def test_connection_draft(body):
    if not body.get("api_key") and not body.get("id"):
        return {
            "ok": False,
            "error_type": "auth_error",
            "message": "API key is required.",
        }
    with _registry_lock:
        data = _load()
        ident = body.get("id")
        old = (
            next((c for c in data["connections"] if c["id"] == ident), None)
            if ident
            else None
        )
        if ident and not old:
            raise KeyError("Connection not found")
        # Only the stored key is inherited; every other test field is explicit.
        profile = _validate_profile(dict(body, name=body.get("name") or "Test"), old)
    return test_llm_connection(profile)
