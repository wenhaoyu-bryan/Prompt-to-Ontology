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

    return get_runtime_llm_config()


def get_runtime_llm_config() -> dict | None:
    """Return masked runtime config, or None if not set."""
    if not _runtime_config:
        return None
    return {
        "configured": True,
        "source": "runtime",
        "provider": _runtime_config.get("provider", ""),
        "model": _runtime_config.get("model", ""),
        "base_url": _runtime_config.get("base_url", ""),
        "key_masked": mask_api_key(_runtime_config.get("api_key", "")),
    }


def clear_runtime_llm_config() -> dict:
    """Clear runtime config. Returns current active status."""
    _runtime_config.clear()
    return get_active_status()


def get_env_llm_config() -> dict:
    """Return environment-based LLM config status."""
    backend = os.environ.get("LLM_BACKEND", "none")
    if backend == "openai":
        key = os.environ.get("OPENAI_API_KEY", "")
        return {
            "configured": bool(key),
            "source": "environment",
            "provider": "openai",
            "model": os.environ.get("OPENAI_MODEL", "gpt-4o"),
            "base_url": os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            "key_masked": mask_api_key(key) if key else "",
        }
    elif backend == "minimax":
        key = os.environ.get("MINIMAX_API_KEY", "")
        return {
            "configured": bool(key),
            "source": "environment",
            "provider": "minimax",
            "model": os.environ.get("MINIMAX_MODEL", "MiniMax-M2.7"),
            "base_url": os.environ.get("MINIMAX_BASE_URL", "https://api.minimaxi.com/v1"),
            "key_masked": mask_api_key(key) if key else "",
        }
    elif backend == "anthropic":
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        return {
            "configured": bool(key),
            "source": "environment",
            "provider": "anthropic",
            "model": "claude-sonnet-4",
            "base_url": "",
            "key_masked": mask_api_key(key) if key else "",
        }
    return {"configured": False, "source": "none", "provider": "none"}


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
    return {"configured": False, "source": "none", "provider": "none"}


def is_llm_configured() -> bool:
    """Check if any LLM config is available."""
    if _runtime_config and _runtime_config.get("api_key"):
        return True
    env = get_env_llm_config()
    return env.get("configured", False)


def mask_api_key(api_key: str) -> str:
    """Mask API key: show first 4 and last 4 chars."""
    if not api_key or len(api_key) < 12:
        return "••••••••" if api_key else ""
    return f"{api_key[:4]}{'•' * (len(api_key) - 8)}{api_key[-4:]}"


def test_llm_connection(config: dict | None = None) -> dict:
    """Test LLM connection with a minimal call."""
    if config:
        provider = config.get("provider", "")
        api_key = config.get("api_key", "")
        model = config.get("model", "")
        base_url = config.get("base_url", "")
    else:
        active = get_active_llm_config()
        provider = active.get("provider", "")
        api_key = active.get("api_key", "")
        model = active.get("model", "")
        base_url = active.get("base_url", "")

    if not api_key:
        return {"ok": False, "error_type": "auth_error", "message": "No API key configured."}

    start = time.time()

    try:
        if provider == "anthropic":
            return _test_anthropic(api_key, model, start)
        else:
            return _test_openai_compat(api_key, model, base_url, provider, start)
    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        err = str(e).lower()
        if "auth" in err or "401" in err or "403" in err:
            return {"ok": False, "error_type": "auth_error", "message": "Authentication failed. Check your API key.", "latency_ms": elapsed}
        elif "timeout" in err:
            return {"ok": False, "error_type": "timeout", "message": "Connection timed out.", "latency_ms": elapsed}
        else:
            return {"ok": False, "error_type": "provider_error", "message": f"Connection failed: {str(e)[:100]}", "latency_ms": elapsed}


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
