import json
import os
import tempfile
import unittest
from unittest.mock import patch, Mock

import llm_config_manager as cfg
import llm_client


class ModelConnectionsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(
            os.environ,
            {
                "LLM_CONNECTIONS_PATH": self.tmp.name + "/connections.json",
                "LLM_BACKEND": "none",
            },
        )
        self.env.start()
        cfg._runtime_config.clear()
        self.profile = {
            "name": "one",
            "provider": "anthropic",
            "model": "claude-test",
            "base_url": "https://example.com/v1/",
            "api_key": "secret-private-key",
        }

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_persistence_bindings_update_delete_and_mask(self):
        snapshot = cfg.save_connection(self.profile)
        ident = snapshot["connections"][0]["id"]
        self.assertNotIn("secret-private-key", json.dumps(snapshot))
        self.assertEqual(snapshot["connections"][0]["base_url"], "https://example.com")
        self.assertEqual(
            os.stat(os.environ["LLM_CONNECTIONS_PATH"]).st_mode & 0o777, 0o600
        )
        cfg.set_bindings({"build": ident, "query": None})
        self.assertEqual(cfg.get_agent_llm_config("build")["model"], "claude-test")
        self.assertEqual(cfg.get_agent_llm_config("query")["provider"], "none")
        with self.assertRaises(RuntimeError):
            cfg.delete_connection(ident)
        changed = dict(self.profile, model="new", api_key="")
        cfg.save_connection(changed, ident)
        self.assertEqual(
            cfg.get_agent_llm_config("build")["api_key"], self.profile["api_key"]
        )
        with self.assertRaises(ValueError):
            cfg.save_connection(dict(changed, api_key="••••"), ident)
        with self.assertRaises(ValueError):
            cfg.set_bindings({"build": None, "query": "bad"})
        self.assertEqual(cfg.connections_snapshot()["bindings"]["build"], ident)
        cfg.set_bindings({"build": None, "query": None})
        self.assertEqual(cfg.delete_connection(ident)["connections"], [])

    def test_invalid_file_url_and_connection_test_no_secret_leak(self):
        for url in (
            "file:///tmp/x",
            "https://user:pass@example.com",
            "https://example.com/?key=x",
        ):
            with self.assertRaises(ValueError):
                cfg.save_connection(dict(self.profile, base_url=url))
        self.assertFalse(cfg.test_connection_draft({})["ok"])
        with patch.object(
            cfg, "_test_anthropic", side_effect=Exception("secret-private-key")
        ):
            self.assertNotIn(
                "secret-private-key",
                json.dumps(cfg.test_connection_draft(self.profile)),
            )
        with open(os.environ["LLM_CONNECTIONS_PATH"], "w") as f:
            f.write("{")
        with self.assertRaises(RuntimeError):
            cfg.connections_snapshot()

    def test_anthropic_roundtrip(self):
        config = dict(self.profile, source="connection")
        block = Mock(type="text", text="ok")
        client = Mock()
        client.messages.create.return_value.content = [block]
        calls = [
            {
                "id": "a",
                "type": "function",
                "function": {"name": "f", "arguments": '{"x":1}'},
            },
            {
                "id": "b",
                "type": "function",
                "function": {"name": "g", "arguments": "{}"},
            },
        ]
        messages = [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": None, "tool_calls": calls},
            {"role": "tool", "tool_call_id": "a", "content": "one"},
            {"role": "tool", "tool_call_id": "b", "content": "two"},
        ]
        schema = {
            "type": "object",
            "additionalProperties": False,
            "properties": {"x": {"type": "integer"}},
        }
        tools = [{"type": "function", "function": {"name": "f", "parameters": schema}}]
        with cfg.llm_config_scope(config), patch(
            "anthropic.Anthropic", return_value=client
        ) as factory:
            llm_client._call_anthropic_with_tools(messages, tools)
        self.assertEqual(factory.call_args.kwargs["base_url"], "https://example.com")
        args = client.messages.create.call_args.kwargs
        self.assertEqual(args["model"], "claude-test")
        self.assertEqual(args["tools"][0]["input_schema"], schema)
        self.assertEqual(
            [x["tool_use_id"] for x in args["messages"][-1]["content"]], ["a", "b"]
        )

    def test_env_anthropic(self):
        with patch.dict(
            os.environ,
            {
                "LLM_BACKEND": "anthropic",
                "ANTHROPIC_API_KEY": "key",
                "ANTHROPIC_MODEL": "custom",
                "ANTHROPIC_BASE_URL": "https://example.com/v1",
            },
        ):
            result = cfg.get_default_llm_config()
            self.assertEqual(
                (result["model"], result["base_url"]), ("custom", "https://example.com")
            )

    def test_openai_adapter_and_http_registry(self):
        from fastapi.testclient import TestClient
        from main import app

        response = Mock()
        response.json.return_value = {"choices": [{"message": {"content": "ok"}}]}
        response.raise_for_status.return_value = None
        profile = dict(
            self.profile,
            provider="openai_compatible",
            base_url="https://example.com/v1",
            model="custom",
        )
        with cfg.llm_config_scope(profile), patch(
            "requests.post", return_value=response
        ) as post:
            llm_client._call_openai_compat([{"role": "user", "content": "hi"}])
        self.assertEqual(
            post.call_args.args[0], "https://example.com/v1/chat/completions"
        )
        self.assertEqual(post.call_args.kwargs["json"]["model"], "custom")
        client = TestClient(app)
        created = client.post("/api/llm/connections", json=profile)
        self.assertEqual(created.status_code, 200)
        ident = created.json()["connections"][0]["id"]
        self.assertNotIn(profile["api_key"], created.text)
        self.assertEqual(
            client.put(
                "/api/llm/bindings", json={"build": ident, "query": None}
            ).status_code,
            200,
        )
        self.assertEqual(
            client.delete("/api/llm/connections/" + ident).status_code, 409
        )

    def test_key_is_bound_to_endpoint_for_save_and_test(self):
        ident = cfg.save_connection(self.profile)["connections"][0]["id"]
        changed = dict(self.profile, api_key="", base_url="https://evil.example")
        with self.assertRaises(ValueError):
            cfg.save_connection(changed, ident)
        with patch.object(cfg, "test_llm_connection") as network:
            with self.assertRaises(ValueError):
                cfg.test_connection_draft(dict(changed, id=ident))
            network.assert_not_called()
        with self.assertRaises(ValueError):
            cfg.save_connection(dict(changed, provider="openai_compatible"), ident)

    def test_origin_and_optional_token(self):
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)
        with patch.dict(
            os.environ,
            {
                "MODEL_CONFIG_TOKEN": "secret-token",
                "MODEL_CONFIG_ALLOWED_ORIGINS": "https://trusted.example",
            },
        ):
            self.assertEqual(
                client.get(
                    "/api/llm/connections",
                    headers={
                        "Origin": "https://evil.example",
                        "Authorization": "Bearer secret-token",
                    },
                ).status_code,
                403,
            )
            self.assertEqual(client.get("/api/llm/connections").status_code, 401)
            self.assertEqual(client.get("/api/llm-config").status_code, 401)
            self.assertEqual(
                client.get(
                    "/api/llm-config",
                    headers={
                        "Origin": "https://evil.example",
                        "Authorization": "Bearer secret-token",
                    },
                ).status_code,
                403,
            )
            invalid = client.post(
                "/api/llm/connections",
                headers={"Authorization": "Bearer secret-token"},
                json={
                    "name": ["private-secret"],
                    "provider": "anthropic",
                    "model": "test",
                    "api_key": ["private-secret"],
                },
            )
            self.assertEqual(invalid.status_code, 422)
            self.assertNotIn("private-secret", invalid.text)
            for origin in (
                "http://localhost:5173",
                "http://[::1]:5173",
                "https://trusted.example",
            ):
                self.assertEqual(
                    client.get(
                        "/api/llm/connections",
                        headers={
                            "Origin": origin,
                            "Authorization": "Bearer secret-token",
                        },
                    ).status_code,
                    200,
                )

    def test_chat_passes_tool_results_to_composer(self):
        import petfood_agent_v2 as agent

        calls = [
            {
                "id": "tool-1",
                "type": "function",
                "function": {"name": "get_product_risk_explanation", "arguments": "{}"},
            }
        ]
        for provider in ("anthropic", "openai_compatible"):
            with self.subTest(provider=provider), cfg.llm_config_scope(
                dict(self.profile, provider=provider)
            ):
                with patch(
                    "llm_client._call_llm",
                    side_effect=[
                        {"message": {"tool_calls": calls}},
                        {"message": {"content": "grounded"}},
                    ],
                ) as model, patch.object(
                    agent,
                    "_execute_tool",
                    return_value={"status": "success", "data": {"value": 42}},
                ):
                    agent.chat("question", {"_planner_transcript": ["untrusted"]})
                    messages, tools = model.call_args_list[1].args
                    self.assertEqual(tools, agent.PET_FOOD_TOOLS)
                    self.assertEqual(
                        model.call_args_list[1].kwargs["tool_choice"], "none"
                    )
                    self.assertEqual(messages[-3]["tool_calls"][0]["id"], "tool-1")
                    self.assertEqual(messages[-2]["tool_call_id"], "tool-1")
                    self.assertIn("42", messages[-2]["content"])

    def test_chat_native_final_payload_disables_tool_use(self):
        import petfood_agent_v2 as agent

        tool_call = {
            "id": "call-1",
            "type": "function",
            "function": {"name": "get_product_risk_explanation", "arguments": "{}"},
        }
        tool_result = {"status": "success", "data": {"value": 42}}
        with cfg.llm_config_scope(self.profile), patch.object(
            agent, "_execute_tool", return_value=tool_result
        ), patch("anthropic.Anthropic") as factory:
            client = factory.return_value
            client.messages.create.side_effect = [
                Mock(
                    content=[
                        Mock(
                            type="tool_use",
                            id="call-1",
                            name="get_product_risk_explanation",
                            input={},
                        )
                    ]
                ),
                Mock(content=[Mock(type="text", text="grounded")]),
            ]
            agent.chat("question")
            final = client.messages.create.call_args_list[1].kwargs
            self.assertTrue(final["tools"])
            self.assertEqual(final["tool_choice"], {"type": "none"})
            self.assertEqual(final["messages"][-3]["content"][0]["id"], "call-1")
            self.assertEqual(
                final["messages"][-2]["content"][0]["tool_use_id"], "call-1"
            )
        first, second = Mock(), Mock()
        first.json.return_value = {
            "choices": [{"message": {"tool_calls": [tool_call]}}]
        }
        second.json.return_value = {"choices": [{"message": {"content": "grounded"}}]}
        with cfg.llm_config_scope(
            dict(self.profile, provider="openai_compatible")
        ), patch.object(agent, "_execute_tool", return_value=tool_result), patch(
            "requests.post", side_effect=[first, second]
        ) as post:
            agent.chat("question")
            final = post.call_args_list[1].kwargs["json"]
            self.assertTrue(final["tools"])
            self.assertEqual(final["tool_choice"], "none")
            self.assertEqual(final["messages"][-2]["tool_call_id"], "call-1")

    def test_bad_registry_does_not_mutate_build_runs(self):
        from fastapi.testclient import TestClient
        from main import app
        import assisted_build_api as api

        with open(os.environ["LLM_CONNECTIONS_PATH"], "w") as f:
            f.write("{")
        client = TestClient(app)
        with patch.object(api.service, "create") as create, patch.object(
            api.schema_design_service, "create"
        ) as schema_create, patch.object(api.service, "retry") as retry, patch.object(
            api.schema_design_service, "retry"
        ) as schema_retry:
            body = {
                "goal": "test",
                "files": [{"name": "test.csv", "content": "a\n1"}],
                "execution_mode": "auto",
            }
            for url in (
                "/api/assisted-build/runs",
                "/api/assisted-build/schema-designs",
            ):
                self.assertEqual(client.post(url, json=body).status_code, 409)
            for url in (
                "/api/assisted-build/runs/a/retry",
                "/api/assisted-build/schema-designs/a/retry",
            ):
                self.assertEqual(
                    client.post(url, json={"expected_revision": 1}).status_code, 409
                )
            for fn in (create, schema_create, retry, schema_retry):
                fn.assert_not_called()
