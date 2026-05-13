"""
MiniMax LLM 调用客户端 — Ontology OS
Anthropic-compatible API (base: https://api.minimaxi.com/anthropic/v1)

用法:
    from minimax_client import MinimaxClient
    client = MinimaxClient()
    response = client.chat(model="MiniMax-M2.7", messages=[...])
"""

from __future__ import annotations

import os
import json
import subprocess
import shlex
from typing import Any


# ============================================================
# 全局配置
# ============================================================

API_KEY = os.getenv("MINIMAX_API_KEY", "")
BASE_URL = "https://api.minimaxi.com/anthropic/v1"
DEFAULT_MODEL = "MiniMax-M2.7"


# ============================================================
# 内部请求工具（curl subprocess，绕过代理）
# ============================================================

def _curl_post(url: str, payload: dict, api_key: str, timeout: int = 60) -> dict:
    """
    通过 curl subprocess 发送 JSON POST 请求（绕过所有代理干扰）。
    返回解析后的 JSON 字典。
    """
    cmd = [
        "curl", "-s", "-X", "POST", url,
        "-H", f"x-api-key: {api_key}",
        "-H", "anthropic-version: 2023-06-01",
        "-H", "content-type: application/json",
        "-d", json.dumps(payload),
        "--noproxy", "*",           # 强制跳过所有代理
        "--connect-timeout", str(timeout),
        "-m", str(timeout),
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout + 5,
    )
    if result.returncode != 0:
        raise Exception(f"MiniMax curl error: {result.stderr.strip()}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        raise Exception(f"MiniMax invalid JSON response: {result.stdout[:300]}")


# ============================================================
# 客户端
# ============================================================

class MinimaxClient:
    """
    MiniMax API 客户端（Anthropic-compatible）。

    通过 curl subprocess 调用，绕过本地代理环境导致的 Python HTTP 库 404 问题。

    支持方法:
        .chat()           — 发送对话请求，返回 AI 回复文本
        .react_complete() — ReAct 完整补全（组装 system + user prompt）
        .health_check()   — 验证 API Key 是否可用
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: int = 60,
    ):
        self.api_key = api_key or API_KEY
        self.base_url = base_url or BASE_URL
        self.model = model or DEFAULT_MODEL
        self.timeout = timeout

    def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        system: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.3,
        **kwargs: Any,
    ) -> str:
        """
        发送对话请求。

        参数:
            messages:    [{role: "user"|"assistant", content: str}, ...]
            model:       模型名称，默认 MiniMax-M2.7
            system:       系统提示词（可选）
            max_tokens:  最大生成 token 数
            temperature: 随机性，0~1，越低越确定性

        返回:
            str — AI 回复的完整文本（自动过滤 thinking 块，仅返回 text）
        """
        payload: dict[str, Any] = {
            "model": model or self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": messages,
        }
        if system:
            payload["system"] = system

        data = _curl_post(self.base_url, payload, self.api_key, self.timeout)

        # 拼接所有 text 块，过滤 thinking（MiniMax-M2.7 推理过程不暴露给用户）
        text_parts = []
        for block in data.get("content", []):
            if block.get("type") == "text":
                text_parts.append(block["text"])
        return "\n".join(text_parts) if text_parts else ""

    def react_complete(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> str:
        """
        专用于 ReAct 推理的完整补全。

        组装方式：system_prompt（角色设定）+ user_prompt（包含上下文和输出格式要求）。
        返回模型原始输出文本，由调用方负责解析为结构化日志。
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        return self.chat(
            messages=messages,
            model=model or self.model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def health_check(self) -> dict:
        """
        验证 API 连通性和 Key 有效性。
        返回 {"ok": True, "model": "..."} 或 {"ok": False, "error": "..."}
        """
        try:
            data = _curl_post(
                self.base_url,
                {
                    "model": self.model,
                    "max_tokens": 10,
                    "messages": [{"role": "user", "content": "Hi"}],
                },
                self.api_key,
                timeout=15,
            )
            return {"ok": True, "model": data.get("model", self.model)}
        except Exception as e:
            return {"ok": False, "error": str(e)}


# ============================================================
# 模块级便捷函数（单例 client）
# ============================================================

_client: MinimaxClient | None = None


def get_client() -> MinimaxClient:
    global _client
    if _client is None:
        _client = MinimaxClient()
    return _client


def chat(messages: list[dict], **kwargs) -> str:
    """直接调用，底用单例 client。"""
    return get_client().chat(messages, **kwargs)


def react_complete(system_prompt: str, user_prompt: str, **kwargs) -> str:
    """直接调用 ReAct 完整补全。"""
    return get_client().react_complete(system_prompt, user_prompt, **kwargs)


def health_check() -> dict:
    """直接调用健康检查。"""
    return get_client().health_check()


# ============================================================
# 调试入口
# ============================================================

if __name__ == "__main__":
    print("=== MiniMax API 健康检查 ===")
    result = health_check()
    print(json.dumps(result, ensure_ascii=False, indent=2))

    print("\n=== 简单对话测试 ===")
    result = chat(
        messages=[{"role": "user", "content": "用一句话介绍 Ontology OS"}],
        system="你是 Ontology OS 的推理引擎。",
        max_tokens=200,
    )
    print(result[:300])
