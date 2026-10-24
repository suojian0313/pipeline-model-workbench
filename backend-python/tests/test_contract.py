"""使用真实 PostgreSQL；仅创建并清理本测试唯一的 __python_* 管线。"""
import json
import os
import re
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.data import import_welds, seed_demo
from app.main import create_app


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://shiti:shiti_local@127.0.0.1:55439/shiti")


@pytest.fixture
def sample(tmp_path):
    line = "__python_" + uuid4().hex
    other = line + "_other"
    components = [
        {"id": "w1", "name": "焊点一", "kind": "Weld", "line_no": line,
         "geometry_ids": ["g1"], "properties": {"material": "steel"}},
        {"id": "a", "name": "左管", "kind": "Pipe", "line_no": line,
         "geometry_ids": ["ga"], "properties": {}},
        {"id": "b", "name": "右管", "kind": "Pipe", "line_no": line,
         "geometry_ids": ["gb"], "properties": {}},
        {"id": "w2", "name": "焊点二", "kind": "Weld", "line_no": line,
         "geometry_ids": ["g2"], "properties": {}},
    ]
    model = {
        "source": {"asset_dir": str(tmp_path)}, "summary": {"model_welds": 2},
        "tree": [{"id": "root", "name": "测试根"}], "components": components,
        "geometry_to_component": {"g1": "w1"}, "node_to_component": {"leaf1": "w1"},
        "model_welds": [
            {"line_no": line, "weld_no": "2", "component_id": "w2",
             "side_1_ids": [], "side_2_ids": [], "missing_sides": [2, 1]},
            {"line_no": line, "weld_no": "10", "component_id": "w1",
             "side_1_ids": ["a"], "side_2_ids": ["b"], "missing_sides": []},
        ],
    }
    (tmp_path / "tileset.json").write_text('{"asset":{"version":"1.0"}}', encoding="utf-8")
    (tmp_path / "tile.b3dm").write_bytes(b"b3dmtest")
    with psycopg.connect(DATABASE_URL) as connection:
        for row_line, weld, date in [(line, "2", None), (line, "10", None),
                                     (line, "999", "2026-10-01"), (other, "10", "2026-10-01")]:
            connection.execute("INSERT INTO weld_records(line_no,weld_no,material_1,material_2,welded_on,is_model) VALUES (%s,%s,'M1','M2',%s,true)", (row_line, weld, date))
    client = TestClient(create_app(model=model, database_url=DATABASE_URL, asset_dir=tmp_path))
    try:
        yield client, line, model, tmp_path
    finally:
        client.close()
        with psycopg.connect(DATABASE_URL) as connection:
            connection.execute("DELETE FROM weld_records WHERE line_no=ANY(%s)", ([line, other],))


def test_public_contract_and_component_aliases(sample):
    client, line, model, _ = sample
    assert client.get("/api/health").json() == {"status": "ok", "backend": "python", "database": "ok"}
    assert client.get("/api/model/summary").json() == model["summary"]
    assert client.get("/api/model/tree").json() == {"roots": model["tree"]}
    for component_id in ["w1", "g1", "leaf1"]:
        assert client.get("/api/components/" + component_id).json() == model["components"][0]
    assert client.get("/api/components/missing").status_code == 404
    page = client.get("/api/components", params={"line_no": line, "search": "STEEL", "limit": 1}).json()
    assert (page["total"], page["offset"], page["limit"]) == (1, 0, 1)
    assert page["items"][0]["id"] == "w1"
    assert client.get("/models/tileset.json").json()["asset"]["version"] == "1.0"
    assert client.get("/models/tile.b3dm").content[:4] == b"b3dm"
    cors = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert cors.headers.get("access-control-allow-origin") in ("*", "http://localhost:5173")


@pytest.mark.parametrize("query", ["limit=1.5", "limit=1e2", "limit=0", "limit=1001", "offset=-1", "offset=1.0", "offset=9007199254740992", "limit=1&limit=2", "offset=0&offset=1", "line_no=a&line_no=b", "search=a&search=b"])
@pytest.mark.parametrize("endpoint", ["components", "welds"])
def test_pagination_and_duplicate_query_parameters_rejected(sample, endpoint, query):
    client, *_ = sample
    # search 仅属于 components；未知单个参数可忽略，但重复参数仍有歧义。
    assert client.get(f"/api/{endpoint}?{query}").status_code == 422


@pytest.mark.parametrize("body", [{}, {"welded_on": 1}, {"welded_on": True}, {"welded_on": ""}, {"welded_on": "2026-2-01"}, {"welded_on": "2026-02-29"}, {"welded_on": "2026-04-31"}, {"welded_on": "0000-01-01"}, {"welded_on": "2026-10-22", "extra": True}, [], None])
def test_update_rejects_invalid_payload(sample, body):
    client, line, *_ = sample
    assert client.put(f"/api/welds/{line}/10", json=body).status_code == 422


def test_weld_persistence_exact_scope_and_completion_links(sample):
    client, line, *_ = sample
    path = f"/api/welds/{line}/10"
    baseline = client.get("/api/progress")
    assert baseline.json()["completed_welds"] == 0
    assert "no-store" in baseline.headers["cache-control"]
    page = client.get("/api/welds", params={"line_no": line}).json()
    assert page["total"] == 2
    assert [row["weld_no"] for row in page["items"]] == ["10", "2"]
    assert client.get("/api/welds", params={"line_no": "' OR 1=1--"}).json()["total"] == 0
    saved = client.put(path, json={"welded_on": "2024-02-29"})
    assert saved.status_code == 200
    assert saved.json()["welded_on"] == "2024-02-29"
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", saved.json()["updated_at"])
    assert client.get(path).json() == saved.json()
    assert "no-store" in client.get(path).headers["cache-control"]
    progress = client.get("/api/progress").json()
    assert progress == {"total_welds": 2, "completed_welds": 1, "percentage": 50,
                        "completed_component_ids": ["a", "b", "w1"],
                        "completed_geometry_ids": ["g1", "ga", "gb"], "missing_links": []}
    client.put(f"/api/welds/{line}/2", json={"welded_on": "2026-10-22"})
    assert client.get("/api/progress").json()["missing_links"] == [
        {"line_no": line, "weld_no": "2", "side": 1}, {"line_no": line, "weld_no": "2", "side": 2}]
    client.put(path, json={"welded_on": None})
    assert client.get(path).json()["welded_on"] is None
    assert client.get("/api/welds/missing/10").status_code == 404
    assert client.put("/api/welds/missing/10", json={"welded_on": None}).status_code == 404


def write_rows(file, rows):
    file.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")


def test_reimport_preserves_dates_and_rollback_spans_batches(sample):
    client, line, _, tmp_path = sample
    client.put(f"/api/welds/{line}/10", json={"welded_on": "2026-10-22"})
    before = client.get(f"/api/welds/{line}/10").json()
    file = tmp_path / "welds.jsonl"
    row = {"line_no": line, "weld_no": "10", "material_1": "NEW", "material_2": "NEW2", "welded_on": None, "is_model": True}
    write_rows(file, [row, row])
    assert import_welds(DATABASE_URL, file, batch_size=1) == 2
    after = client.get(f"/api/welds/{line}/10").json()
    assert after["material_1"] == "NEW"
    assert (after["welded_on"], after["updated_at"]) == (before["welded_on"], before["updated_at"])
    write_rows(file, [{**row, "material_1": "ROLLBACK"}, {**row, "welded_on": "2026-02-30"}])
    with pytest.raises(ValueError):
        import_welds(DATABASE_URL, file, batch_size=1)
    assert client.get(f"/api/welds/{line}/10").json() == after


def test_seed_is_explicit_and_idempotent(sample):
    client, line, model, _ = sample
    assert seed_demo(DATABASE_URL, model) == 1
    assert client.get(f"/api/welds/{line}/2").json()["welded_on"] == "2026-10-01"
    assert client.get(f"/api/welds/{line}/10").json()["welded_on"] is None
    assert seed_demo(DATABASE_URL, model) == 0


def test_percentage_uses_half_up_and_empty_model_is_zero(sample):
    client, line, model, tmp_path = sample
    client.put(f"/api/welds/{line}/10", json={"welded_on": "2026-10-22"})
    # 1/32 * 100 = 3.125，应与 JS Math.round 一样得到 3.13。
    extended = {**model, "model_welds": [*model["model_welds"], *[
        {"line_no": line, "weld_no": f"absent-{index}", "component_id": None,
         "side_1_ids": [], "side_2_ids": [], "missing_sides": [1, 2]}
        for index in range(30)]]}
    with TestClient(create_app(model=extended, database_url=DATABASE_URL, asset_dir=tmp_path)) as rounding:
        progress = rounding.get("/api/progress").json()
        assert (progress["completed_welds"], progress["total_welds"], progress["percentage"]) == (1, 32, 3.13)
    empty = {**model, "model_welds": []}
    with TestClient(create_app(model=empty, database_url=DATABASE_URL, asset_dir=tmp_path)) as blank:
        assert blank.get("/api/progress").json() == {
            "total_welds": 0, "completed_welds": 0, "percentage": 0,
            "completed_component_ids": [], "completed_geometry_ids": [], "missing_links": []}
        assert blank.get("/api/welds").json()["total"] == 0


def test_import_duplicate_keys_in_one_batch_last_source_fields_win(sample):
    client, line, _, tmp_path = sample
    file = tmp_path / "duplicates.jsonl"
    row = {"line_no": line, "weld_no": "10", "material_1": "FIRST", "material_2": "M2",
           "welded_on": None, "is_model": True}
    write_rows(file, [row, {**row, "material_1": "LAST"}])
    assert import_welds(DATABASE_URL, file, batch_size=1000) == 2
    assert client.get(f"/api/welds/{line}/10").json()["material_1"] == "LAST"
