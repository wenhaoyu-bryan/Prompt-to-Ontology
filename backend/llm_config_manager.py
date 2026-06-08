"""
LLM Runtime Configuration Manager.

Manages runtime LLM config (from UI) and environment config.
Runtime config takes priority over environment variables.
API keys are never persisted to disk, database, or returned unmasked.
"""

import os
import time

# In-memory runtime config (cleared on backend restart)
_runtime_config: dict = {}

# Default base URLs per provider
_DEFAULTS = {
    "openai": {"base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
    "minimax": {"base_url": "https://api.minimaxi.com/v1", "model": "MiniMax-M2.7"},
    "anthropic": {"base_url": "", "model": "claude-sonnet-4"},
    "openai_compatible": {"base_url": "", "model": ""},
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


def _build_status(configured, source, provider=None, model=None, base_url=None,
                   key_masked=None, editable=False, deletable=False, message=""):
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
    _runtime_config.update({
        "provider": provider,
        "api_key": api_key,
        "model": model,
        "base_url": base_url,
        "source": "runtime",
    })

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
            "message": "Runtime config cleared. No LLM config found." if had_runtime
                       else "No LLM config found. Agent will use deterministic fallback.",
        }


def get_env_llm_config() -> dict:
    """Return environment-based LLM config status."""
    backend = os.environ.get("LLM_BACKEND", "none")
    if backend == "openai":
        key = os.environ.get("OPENAI_API_KEY", "")
        return _build_status(
            configured=bool(key),
            source="environment",
            provider="openai",
            model=os.environ.get("OPENAI_MODEL", "gpt-4o"),
            base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            key_masked=mask_api_key(key) if key else None,
            editable=True,
            deletable=False,
            message="LLM is configured through backend environment variables." if key
                    else "No LLM config found. Agent will use deterministic fallback.",
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
            message="LLM is configured through backend environment variables." if key
                    else "No LLM config found. Agent will use deterministic fallback.",
        )
    elif backend == "anthropic":
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        return _build_status(
            configured=bool(key),
            source="environment",
            provider="anthropic",
            model="claude-sonnet-4",
            base_url="",
            key_masked=mask_api_key(key) if key else None,
            editable=True,
            deletable=False,
            message="LLM is configured through backend environment variables." if key
                    else "No LLM config found. Agent will use deterministic fallback.",
        )
    return _build_status(
        configured=False, source="none", provider=None, model=None, base_url=None,
        key_masked=None, editable=True, deletable=False,
        message="No LLM config found. Agent will use deterministic fallback.",
    )


def get_active_llm_config() -> dict:
    """Return the active config (runtime > env) with raw keys for internal use."""
    if _runtime_config and _runtime_config.get("api_key"):
        return dict(_runtime_config)

    backend = os.environ.get("LLM_BACKEND", "none")
    if backend == "openai":
        return {
            "provider": "openai",
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
            "base_url": os.environ.get("MINIMAX_BASE_URL", "https://api.minimaxi.com/v1"),
            "source": "environment",
        }
    elif backend == "anthropic":
        return {
            "provider": "anthropic",
            "api_key": os.environ.get("ANTHROPIC_API_KEY", ""),
            "model": "claude-sonnet-4",
            "base_url": "",
            "source": "environment",
        }
    return {"provider": "none", "api_key": "", "model": "", "base_url": "", "source": "none"}


def get_active_status() -> dict:
    """Return masked status of the active config."""
    if _runtime_config:
        return get_runtime_llm_config()
    env = get_env_llm_config()
    if env.get("configured"):
        return env
    return _build_status(
        configured=False, source="none", provider=None, model=None, base_url=None,
        key_masked=None, editable=True, deletable=False,
        message="No LLM config found. Agent will use deterministic fallback.",
    )


def is_llm_configured() -> bool:
    """Check if any LLM config is available."""
    if _runtime_config and _runtime_config.get("api_key"):
        return True
    env = get_env_llm_config()
    return env.get("configured", False)


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
        return {"ok": False, "error_type": "auth_error", "message": "No API key configured.", "testing": testing_label}

    start = time.time()

    try:
        if provider == "anthropic":
            result = _test_anthropic(api_key, model, start)
        else:
            result = _test_openai_compat(api_key, model, base_url, provider, start)
        result["testing"] = testing_label
        return result
    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        err = str(e).lower()
        if "auth" in err or "401" in err or "403" in err:
            return {"ok": False, "error_type": "auth_error", "message": "Authentication failed. Check your API key.", "latency_ms": elapsed, "testing": testing_label}
        elif "timeout" in err:
            return {"ok": False, "error_type": "timeout", "message": "Connection timed out.", "latency_ms": elapsed, "testing": testing_label}
        else:
            return {"ok": False, "error_type": "provider_error", "message": f"Connection failed: {str(e)[:100]}", "latency_ms": elapsed, "testing": testing_label}


def _test_openai_compat(api_key: str, model: str, base_url: str, provider: str, start: float) -> dict:
    import requests

    if not base_url:
        if provider == "minimax":
            base_url = "https://api.minimaxi.com/v1"
        else:
            base_url = "https://api.openai.com/v1"

    resp = requests.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"model": model, "messages": [{"role": "user", "content": 'Say "ok".'}], "max_tokens": 10},
        timeout=30,
    )
    resp.raise_for_status()
    elapsed = int((time.time() - start) * 1000)
    return {"ok": True, "provider": provider, "model": model, "latency_ms": elapsed, "message": "Connection test succeeded."}


def _test_anthropic(api_key: str, model: str, start: float) -> dict:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=model or "claude-sonnet-4-20250514",
        max_tokens=10,
        messages=[{"role": "user", "content": 'Say "ok".'}],
    )
    elapsed = int((time.time() - start) * 1000)
    return {"ok": True, "provider": "anthropic", "model": model, "latency_ms": elapsed, "message": "Connection test succeeded."}
