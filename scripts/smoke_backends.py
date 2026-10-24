"""对两个真实 HTTP 服务执行同一契约测试，所有日期修改在 finally 中恢复。"""
import argparse
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def request(base, path, method="GET", body=None, expected=200, binary=False):
    payload = None if body is None else json.dumps(body).encode()
    req = Request(base + path, data=payload, method=method,
                  headers={"Content-Type": "application/json"} if payload is not None else {})
    try:
        with urlopen(req, timeout=30) as response:
            status, content = response.status, response.read()
    except HTTPError as error:
        status, content = error.code, error.read()
    assert status == expected, (method, base + path, status, expected, content[:300])
    return content if binary else json.loads(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default="http://127.0.0.1:3001")
    parser.add_argument("--python", default="http://127.0.0.1:3002")
    args = parser.parse_args()
    bases = [args.node, args.python]
    line = "WW-08001-80-QHA"
    path = f"/api/welds/{line}/1"
    for base in bases:
        assert request(base, "/api/health")["database"] == "ok"
        summary = request(base, "/api/model/summary")
        assert (summary["business_components"], summary["geometry_components"], summary["model_welds"]) == (1791, 7154, 627)
        tree = request(base, "/api/model/tree")
        assert tree["roots"][0]["name"] == "动力站.nwc"
        tile = request(base, "/models/detail_tile_00011_LOD1.b3dm", binary=True)
        assert tile[:4] == b"b3dm"
        assert request(base, "/models/tileset.json")["asset"]["version"] == "1.0"
        component = request(base, "/api/components/cmp_hash_662540128_194")
        assert component["kind"] == "Weld" and component["line_no"] == line
        assert component["properties"]["EP3D_焊点编号"] == "1"
        assert "cmp_hash_662540128_194" in component["geometry_ids"]
        assert request(base, "/api/components?line_no=" + line + "&limit=1")["items"][0]["line_no"] == line
        request(base, "/api/components/unknown", expected=404)
        request(base, "/api/welds/unknown/unknown", expected=404)
        for endpoint in ["/api/welds?offset=-1", "/api/components?limit=1.5", "/api/components?limit=1e2",
                         "/api/welds?limit=1001", "/api/welds?limit=0", "/api/welds?limit=1&limit=2",
                         "/api/welds?offset=9007199254740992"]:
            request(base, endpoint, expected=422)
        for body in [{}, {"welded_on": "2026-02-30"}, {"welded_on": "2026-1-1"}, {"welded_on": ""},
                     {"welded_on": 1}, {"welded_on": "2026-10-22", "extra": True}]:
            request(base, path, "PUT", body, expected=422)
        # 若 SQL 参数被错误拼接，这个输入可能绕过过滤或报 500。
        assert request(base, "/api/welds?line_no=%27%20OR%201%3D1--")["total"] == 0

    original = request(bases[0], path)["welded_on"]
    try:
        request(bases[0], path, "PUT", {"welded_on": None})
        baseline = request(bases[1], "/api/progress")
        saved = request(bases[0], path, "PUT", {"welded_on": "2026-10-22"})
        assert saved["welded_on"] == "2026-10-22"
        assert request(bases[1], path)["welded_on"] == "2026-10-22", "Python 未看到 Node 写入的日期"
        progress = request(bases[1], "/api/progress")
        assert progress["total_welds"] == 627
        assert progress["completed_welds"] == baseline["completed_welds"] + 1
        assert "cmp_hash_662540128_194" in progress["completed_geometry_ids"]
        component = request(bases[0], "/api/components/cmp_hash_662540128_194")
        assert component["id"] in progress["completed_component_ids"]
        assert len(progress["completed_component_ids"]) >= 3, "未包含焊缝两侧构件"
        assert progress == request(bases[0], "/api/progress"), "两种语言进度计算不一致"
        request(bases[1], path, "PUT", {"welded_on": "2024-02-29"})
        assert request(bases[0], path)["welded_on"] == "2024-02-29", "Node 未看到 Python 写入的闰日"
        request(bases[1], path, "PUT", {"welded_on": None})
        cleared = request(bases[0], "/api/progress")
        assert cleared == baseline, "日期清空后进度没有恢复"
    finally:
        request(bases[0], path, "PUT", {"welded_on": original})
    print("PASS: both HTTP backends, real PostgreSQL cross-writes, strict validation, static models and progress")


if __name__ == "__main__":
    main()
