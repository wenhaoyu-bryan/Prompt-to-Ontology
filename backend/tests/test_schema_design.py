from pathlib import Path
import json
import unittest
import tempfile
import inspect
from unittest import mock


def parameterize(names, cases):
    def decorate(fn):
        fn._cases = (names.split(","), cases)
        return fn

    return decorate


import yaml
from assisted_build.schema_design import SchemaDesignService
from ontology_kernel.schema_loader import load_ontology_schema

ROOT = Path(__file__).resolve().parents[2]


def make(tmp_path, content="supplier_id,supplier_name\n001,A\n002,B\n"):
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.create(
        "Design suppliers",
        [{"name": "Supplier.csv", "content": content}],
        "deterministic",
    )
    return s, s.analyze(r["id"])


def accept(s, r):
    r["objects"][0]["decision"] = "accepted"
    return s.update(r["id"], r["revision"], r["objects"], r["links"])


def test_save_and_loader_roundtrip(tmp_path):
    s, r = make(tmp_path)
    r = accept(s, r)
    r = s.preview(r["id"], r["revision"])
    assert r["preview"]["summary"]["errors"] == 0
    r = s.save(r["id"], r["revision"], r["preview"]["hash"])
    result = s.export(r["id"])
    for f in result["files"]:
        (tmp_path / f["name"]).write_text(f["content"])
    schema = load_ontology_schema("test", str(tmp_path))
    assert schema.object_types["Supplier"].primary_key == "supplier_id"
    assert result["manifest"]["status"] == "draft"
    edited = s.update(r["id"], r["revision"], r["objects"], [])
    with unittest.TestCase().assertRaises(RuntimeError):
        s.export(edited["id"])


def test_invalid_keys_and_bindings_block_save(tmp_path):
    s, r = make(tmp_path, "supplier_id,supplier_name\n001,A\n001,B\n")
    r = accept(s, r)
    r["objects"][0]["primary_key"] = "supplier_id"
    r["objects"][0]["properties"][0]["source_column"] = "absent"
    r = s.update(r["id"], r["revision"], r["objects"], [])
    r = s.preview(r["id"], r["revision"])
    assert {"INVALID_BINDING", "INVALID_KEY_VALUES"} <= {i["code"] for i in r["issues"]}
    with unittest.TestCase().assertRaises(ValueError):
        s.save(r["id"], r["revision"], r["preview"]["hash"])


def test_pending_stale_and_delete(tmp_path):
    s, r = make(tmp_path)
    r = s.preview(r["id"], r["revision"])
    assert r["preview"]["summary"]["pending"] == 1
    with unittest.TestCase().assertRaises(RuntimeError):
        s.update(r["id"], r["revision"] - 1, r["objects"], [])
    with unittest.TestCase().assertRaises(ValueError):
        s.save(r["id"], r["revision"], r["preview"]["hash"])
    s.delete(r["id"])
    with unittest.TestCase().assertRaises(KeyError):
        s.get_run(r["id"])


def test_collision_and_unconfirmed_endpoint(tmp_path):
    s, r = make(tmp_path)
    r = accept(s, r)
    r["objects"][0]["name"] = "Brand"
    link = {
        "id": "l-test",
        "name": "RELATED_TO",
        "label": "",
        "description": "",
        "from": "Brand",
        "to": "Unknown",
        "cardinality": "MANY_TO_MANY",
        "source_id": "source-1",
        "source_column": "supplier_id",
        "target_column": "supplier_id",
        "decision": "accepted",
        "intent": "new",
    }
    r = s.update(r["id"], r["revision"], r["objects"], [link])
    r = s.preview(r["id"], r["revision"])
    assert {"COLLISION", "INVALID_ENDPOINT"} <= {i["code"] for i in r["issues"]}


def test_model_valid_and_invalid_fallback(tmp_path, monkeypatch):
    import llm_client

    s = SchemaDesignService(ROOT, tmp_path)
    files = [
        {"name": "Supplier.csv", "content": "supplier_id,supplier_name\n001,A\n002,B\n"}
    ]
    baseline = s.analyze(s.create("suppliers", files, "deterministic")["id"])
    proposal = {"objects": baseline["objects"], "links": []}
    monkeypatch.setattr(
        llm_client,
        "_call_llm",
        lambda messages: {"message": {"content": json.dumps(proposal)}},
    )
    r = s.analyze(s.create("suppliers", files, "auto")["id"])
    assert (
        r["steps"][-1]["method"] == "model" and r["steps"][-1]["status"] == "completed"
    )
    monkeypatch.setattr(
        llm_client, "_call_llm", lambda messages: {"message": {"content": "not json"}}
    )
    r = s.analyze(s.create("suppliers", files, "auto")["id"])
    assert r["steps"][-1]["status"] == "fallback"


def test_restart_and_retry(tmp_path):
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.create(
        "suppliers",
        [{"name": "Supplier.csv", "content": "supplier_id\n001\n"}],
        "deterministic",
    )
    s.recover_interrupted()
    r = s.get_run(r["id"])
    assert r["status"] == "interrupted"
    r = s.retry(r["id"], r["revision"])
    assert s.analyze(r["id"])["status"] == "needs_confirmation"


def sources_example():
    return [
        {
            "name": "Supplier.csv",
            "content": "supplier_id,supplier_name\n001,A\n002,B\n",
        },
        {
            "name": "ProductionBatch.csv",
            "content": "batch_id,supplier_id\nB1,001\nB2,001\n",
        },
    ]


def active_candidate(s, name, intent="reuse"):
    old = s._schema()["object_types"][name]
    return {
        "id": "o-existing",
        "name": name,
        "label": old["label"],
        "description": old["description"],
        "primary_key": old["primary_key"],
        "display_name": old["display_name"],
        "source_id": "source-1",
        "decision": "accepted",
        "intent": intent,
        "properties": [
            {
                "name": p["name"],
                "type": p["type"],
                "required": p["required"],
                "description": p["description"],
                "unit": p["unit"],
                "source_id": "source-1",
                "source_column": p["name"] if p["name"] == old["primary_key"] else "",
            }
            for p in old["properties"]
        ],
    }


def test_baseline_links_and_pending_block(tmp_path):
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.analyze(s.create("design", sources_example(), "deterministic")["id"])
    assert [o["primary_key"] for o in r["objects"]] == ["supplier_id", "batch_id"]
    assert len(r["links"]) == 1 and r["links"][0]["name"].startswith(
        "REFERENCES_ProductionBatch_Supplier_"
    )
    assert r["links"][0]["decision"] == "pending"
    r = s.preview(r["id"], r["revision"])
    assert r["preview"]["summary"]["pending"] == 3


def test_model_link_with_pending_endpoints(tmp_path, monkeypatch):
    import llm_client

    s = SchemaDesignService(ROOT, tmp_path)
    baseline = s.analyze(s.create("design", sources_example(), "deterministic")["id"])
    proposal = {"objects": baseline["objects"], "links": baseline["links"]}
    monkeypatch.setattr(
        llm_client,
        "_call_llm",
        lambda messages: {"message": {"content": json.dumps(proposal)}},
    )
    r = s.analyze(s.create("design", sources_example(), "auto")["id"])
    assert r["steps"][-1]["status"] == "completed" and len(r["links"]) == 1


def test_sparse_reuse_and_extend_roundtrip(tmp_path):
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.analyze(
        s.create(
            "reuse",
            [{"name": "brand.csv", "content": "brand_id,new_field\n001,A\n002,B\n"}],
            "deterministic",
        )["id"]
    )
    candidate = active_candidate(s, "Brand", "extend")
    candidate["properties"].append(
        {
            "name": "new_field",
            "type": "string",
            "required": False,
            "description": "",
            "unit": "",
            "source_id": "source-1",
            "source_column": "new_field",
        }
    )
    r = s.update(r["id"], r["revision"], [candidate], [])
    r = s.preview(r["id"], r["revision"])
    assert r["preview"]["summary"]["errors"] == 0
    r = s.save(r["id"], r["revision"], r["preview"]["hash"])
    files = s.export(r["id"])["files"]
    for f in files:
        (tmp_path / f["name"]).write_text(f["content"])
    loaded = load_ontology_schema("test", str(tmp_path))
    assert {p.name for p in loaded.object_types["Brand"].properties} == {
        "brand_id",
        "brand_name",
        "country",
        "new_field",
    }


@parameterize(
    "field,value",
    [
        ("label", "changed"),
        ("description", "changed"),
        ("display_name", "brand_name"),
        ("primary_key", "country"),
    ],
)
def test_extend_rejects_existing_metadata_change(tmp_path, field, value):
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.analyze(
        s.create(
            "reuse",
            [{"name": "brand.csv", "content": "brand_id\n001\n002\n"}],
            "deterministic",
        )["id"]
    )
    candidate = active_candidate(s, "Brand", "extend")
    candidate[field] = value
    r = s.update(r["id"], r["revision"], [candidate], [])
    r = s.preview(r["id"], r["revision"])
    assert "EXISTING_DEFINITION_CHANGED" in {i["code"] for i in r["issues"]}


@parameterize(
    "field,value",
    [
        ("type", "number"),
        ("required", True),
        ("description", "changed"),
        ("unit", "kg"),
    ],
)
def test_extend_rejects_existing_property_change(tmp_path, field, value):
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.analyze(
        s.create(
            "reuse",
            [{"name": "brand.csv", "content": "brand_id\n001\n002\n"}],
            "deterministic",
        )["id"]
    )
    candidate = active_candidate(s, "Brand", "extend")
    candidate["properties"][1][field] = value
    r = s.update(r["id"], r["revision"], [candidate], [])
    r = s.preview(r["id"], r["revision"])
    assert "EXISTING_DEFINITION_CHANGED" in {i["code"] for i in r["issues"]}


def test_excluded_endpoint_blocks_link(tmp_path):
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.analyze(s.create("design", sources_example(), "deterministic")["id"])
    r["objects"][0]["decision"] = "excluded"
    r["objects"][1]["decision"] = "accepted"
    r["links"][0]["decision"] = "accepted"
    r = s.update(r["id"], r["revision"], r["objects"], r["links"])
    r = s.preview(r["id"], r["revision"])
    assert "INVALID_ENDPOINT" in {i["code"] for i in r["issues"]}


def test_delete_during_model_call(tmp_path, monkeypatch):
    import llm_client

    s = SchemaDesignService(ROOT, tmp_path)
    r = s.create("design", sources_example(), "auto")

    def delete_during_call(messages):
        s.delete(r["id"])
        return {"message": {"content": "invalid"}}

    monkeypatch.setattr(llm_client, "_call_llm", delete_during_call)
    assert s.analyze(r["id"]) is None
    assert not (s.runtime / r["id"]).exists()


def test_stale_preview_and_revision(tmp_path):
    s, r = make(tmp_path)
    r = accept(s, r)
    r = s.preview(r["id"], r["revision"])
    h = r["preview"]["hash"]
    r = s.update(r["id"], r["revision"], r["objects"], [])
    with unittest.TestCase().assertRaises(RuntimeError):
        s.save(r["id"], r["revision"], h)
    with unittest.TestCase().assertRaises(RuntimeError):
        s.preview(r["id"], r["revision"] - 1)


@parameterize("content", ["name\nA\nB\n", '[{"supplier_id":1},{"supplier_id":2}]'])
def test_missing_or_numeric_key_not_suggested(tmp_path, content):
    s, r = make(tmp_path, content)
    assert r["objects"][0]["primary_key"] == ""


@parameterize(
    "files",
    [
        [],
        [{"name": "x", "content": "a\n1\n"}] * 9,
        [{"name": "x", "content": "a\n" + ("x" * 10001) + "\n"}],
    ],
)
def test_input_bounds(tmp_path, files):
    with unittest.TestCase().assertRaises(ValueError):
        SchemaDesignService(ROOT, tmp_path).create("design", files, "deterministic")


def test_http_routes(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import assisted_build_api as api

    monkeypatch.setattr(
        api, "schema_design_service", SchemaDesignService(ROOT, tmp_path)
    )
    app = FastAPI()
    app.include_router(api.router)
    client = TestClient(app)
    response = client.post(
        "/api/assisted-build/schema-designs",
        json={
            "goal": "design",
            "files": sources_example(),
            "execution_mode": "deterministic",
        },
    )
    assert response.status_code == 202
    rid = response.json()["id"]
    r = client.get("/api/assisted-build/schema-designs/" + rid).json()
    assert r["status"] == "needs_confirmation"
    assert client.get("/api/assisted-build/schema-designs").status_code == 200
    assert (
        client.get("/api/assisted-build/schema-design-sample-files").status_code == 200
    )
    assert client.delete("/api/assisted-build/schema-designs/" + rid).status_code == 200


def test_model_empty_fallback(tmp_path, monkeypatch):
    import llm_client

    s = SchemaDesignService(ROOT, tmp_path)
    monkeypatch.setattr(
        llm_client,
        "_call_llm",
        lambda messages: {"message": {"content": '{"objects": [], "links": []}'}},
    )
    r = s.analyze(s.create("design", sources_example(), "auto")["id"])
    assert r["steps"][-1]["status"] == "fallback"
    assert len(r["objects"]) == 2


def test_multiple_sources_have_distinct_link_names(tmp_path):
    files = sources_example() + [
        {"name": "Purchase.csv", "content": "purchase_id,supplier_id\nP1,001\nP2,001\n"}
    ]
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.analyze(s.create("design", files, "deterministic")["id"])
    assert len(r["links"]) == 2
    assert len({link["name"] for link in r["links"]}) == 2


def test_schema_staleness(tmp_path):
    import shutil

    root = tmp_path / "root"
    shutil.copytree(ROOT / "ontology" / "pet_food", root / "ontology" / "pet_food")
    s = SchemaDesignService(root, tmp_path / "runtime")
    r = s.analyze(s.create("design", sources_example(), "deterministic")["id"])
    path = root / "ontology" / "pet_food" / "object_types.yaml"
    data = yaml.safe_load(path.read_text())
    data["object_types"]["Brand"]["description"] = "Changed"
    path.write_text(yaml.safe_dump(data))
    with unittest.TestCase().assertRaises(RuntimeError):
        s.preview(r["id"], r["revision"])


def test_excluded_blank_candidate_does_not_block(tmp_path):
    s, r = make(tmp_path)
    r = accept(s, r)
    excluded = dict(
        r["objects"][0],
        id="o-blank",
        name="",
        intent="",
        source_id="",
        decision="excluded",
        properties=[],
    )
    r = s.update(r["id"], r["revision"], r["objects"] + [excluded], [])
    r = s.preview(r["id"], r["revision"])
    assert r["preview"]["summary"]["errors"] == 0
    assert s.save(r["id"], r["revision"], r["preview"]["hash"])["status"] == "saved"


def test_excluded_duplicate_name_does_not_block(tmp_path):
    s, r = make(tmp_path)
    r = accept(s, r)
    excluded = dict(r["objects"][0], id="o-duplicate", decision="excluded")
    r = s.update(r["id"], r["revision"], [excluded] + r["objects"], [])
    r = s.preview(r["id"], r["revision"])
    assert r["preview"]["summary"]["errors"] == 0
    assert s.save(r["id"], r["revision"], r["preview"]["hash"])["status"] == "saved"


def test_preview_after_matches_export_for_new_and_extend(tmp_path):
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.analyze(
        s.create(
            "design",
            [
                {"name": "brand.csv", "content": "brand_id,new_field\n001,A\n002,B\n"},
                {"name": "Supplier.csv", "content": "supplier_id\nS1\nS2\n"},
            ],
            "deterministic",
        )["id"]
    )
    candidate = active_candidate(s, "Brand", "extend")
    candidate["properties"].append(
        {
            "name": "new_field",
            "type": "string",
            "required": False,
            "description": "",
            "unit": "",
            "source_id": "source-1",
            "source_column": "new_field",
        }
    )
    supplier = r["objects"][1]
    supplier["decision"] = "accepted"
    r = s.update(r["id"], r["revision"], [candidate, supplier], [])
    r = s.preview(r["id"], r["revision"])
    expected = {d["name"]: d["after"] for d in r["preview"]["definitions"]}
    r = s.save(r["id"], r["revision"], r["preview"]["hash"])
    for f in s.export(r["id"])["files"]:
        (tmp_path / f["name"]).write_text(f["content"])
    schema = load_ontology_schema("test", str(tmp_path))
    for name, definition in expected.items():
        assert definition == schema.object_types[name].model_dump(mode="json")


def test_reuse_preview_is_identical_and_matches_export(tmp_path):
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.analyze(
        s.create(
            "reuse",
            [{"name": "brand.csv", "content": "brand_id\n001\n002\n"}],
            "deterministic",
        )["id"]
    )
    r = s.update(r["id"], r["revision"], [active_candidate(s, "Brand")], [])
    r = s.preview(r["id"], r["revision"])
    definition = r["preview"]["definitions"][0]
    assert definition["before"] == definition["after"]
    r = s.save(r["id"], r["revision"], r["preview"]["hash"])
    for f in s.export(r["id"])["files"]:
        (tmp_path / f["name"]).write_text(f["content"])
    assert definition["after"] == load_ontology_schema(
        "test", str(tmp_path)
    ).object_types["Brand"].model_dump(mode="json")


def test_model_prompt_includes_exact_baseline_contract(tmp_path, monkeypatch):
    import llm_client

    captured = {}

    def respond(messages):
        captured["system"] = messages[0]["content"]
        context = json.loads(messages[1]["content"])
        captured["context"] = context
        return {"message": {"content": json.dumps(context["baseline"])}}

    monkeypatch.setattr(llm_client, "_call_llm", respond)
    s = SchemaDesignService(ROOT, tmp_path)
    r = s.analyze(s.create("design", sources_example(), "auto")["id"])
    assert r["steps"][-1]["status"] == "completed"
    assert len(captured["context"]["baseline"]["objects"]) == 2
    assert len(captured["context"]["baseline"]["links"]) == 1
    assert "every candidate decision" in captured["system"]


class _MonkeyPatch:
    def __init__(self):
        self.patches = []

    def setattr(self, obj, name, value):
        patcher = mock.patch.object(obj, name, value)
        patcher.start()
        self.patches.append(patcher)

    def close(self):
        for patcher in reversed(self.patches):
            patcher.stop()


class SchemaDesignTests(unittest.TestCase):
    pass


def _register_tests():
    for name, function in list(globals().items()):
        if not name.startswith("test_") or not callable(function):
            continue
        names, cases = getattr(function, "_cases", ([], [()]))
        for index, case in enumerate(cases):
            values = case if isinstance(case, tuple) else (case,)

            def run(self, fn=function, names=names, values=values):
                with tempfile.TemporaryDirectory() as directory:
                    monkeypatch = _MonkeyPatch()
                    try:
                        supplied = dict(zip(names, values))
                        supplied.update(
                            {"tmp_path": Path(directory), "monkeypatch": monkeypatch}
                        )
                        fn(
                            **{
                                key: supplied[key]
                                for key in inspect.signature(fn).parameters
                            }
                        )
                    finally:
                        monkeypatch.close()

            setattr(SchemaDesignTests, name + ("_" + str(index) if names else ""), run)


_register_tests()
