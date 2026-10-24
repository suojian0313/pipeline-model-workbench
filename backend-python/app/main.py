"""HTTP 层只负责输入、调用和输出；普通 def 路由在线程池中访问同步数据库。"""
import json
import math
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import DATABASE_URL, PROJECT_ROOT, load_model
from app.db import MODEL_SCOPE_SQL, WELD_FIELDS, connect, model_scope, serialize_weld
from app.domain import WeldUpdate, normalize_id


def pagination(request: Request, default_limit: int) -> tuple[int, int]:
    query = request.query_params
    for name in ("offset", "limit", "line_no", "search"):
        if len(query.getlist(name)) > 1:
            raise HTTPException(422, f"{name} 不能重复")

    def integer(name: str, default: int, minimum: int, maximum: int) -> int:
        value = query.get(name)
        if value is None:
            return default
        if not re.fullmatch(r"[0-9]+", value):
            raise HTTPException(422, f"{name} 必须是整数")
        # 先去除前导零并比较位数，避免任意大字符串触发 Python int 位数限制。
        digits = value.lstrip("0") or "0"
        if len(digits) > len(str(maximum)):
            raise HTTPException(422, f"{name} 超出允许范围")
        number = int(digits)
        if not minimum <= number <= maximum:
            raise HTTPException(422, f"{name} 超出允许范围")
        return number

    return integer("offset", 0, 0, 9007199254740991), integer("limit", default_limit, 1, 1000)


def create_app(model: dict | None = None, database_url: str | None = None,
               asset_dir: str | Path | None = None) -> FastAPI:
    model = load_model() if model is None else model
    database_url = DATABASE_URL if database_url is None else database_url
    components = {normalize_id(item["id"]): item for item in model["components"]}
    aliases = {normalize_id(key): normalize_id(value) for key, value in
               {**model["geometry_to_component"], **model["node_to_component"]}.items()}
    scope = model_scope(model)
    app = FastAPI(title="焊接进度 Python 教学 API")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    assets = Path(asset_dir) if asset_dir is not None else PROJECT_ROOT / model["source"]["asset_dir"]
    app.mount("/models", StaticFiles(directory=assets), name="models")

    @app.middleware("http")
    async def no_status_cache(request: Request, call_next):
        response = await call_next(request)
        if request.method == "GET" and (request.url.path == "/api/progress"
                or request.url.path == "/api/welds" or request.url.path.startswith("/api/welds/")):
            response.headers["Cache-Control"] = "no-store, max-age=0"
        return response

    @app.get("/api/health")
    def health():
        with connect(database_url) as connection:
            connection.execute("SELECT 1")
        return {"status": "ok", "backend": "python", "database": "ok"}

    @app.get("/api/model/summary")
    def summary():
        return model["summary"]

    @app.get("/api/model/tree")
    def tree():
        return {"roots": model["tree"]}

    @app.get("/api/components")
    def list_components(request: Request):
        offset, limit = pagination(request, 100)
        line = normalize_id(request.query_params.get("line_no", ""))
        search = normalize_id(request.query_params.get("search", "")).lower()
        filtered = [item for item in model["components"]
                    if (not line or normalize_id(item["line_no"]) == line)
                    and (not search or search in normalize_id(json.dumps(item, ensure_ascii=False, separators=(",", ":"))).lower())]
        return {"items": filtered[offset:offset + limit], "total": len(filtered), "offset": offset, "limit": limit}

    @app.get("/api/components/{component_id}")
    def component(component_id: str):
        key = normalize_id(component_id)
        result = components.get(key) or components.get(aliases.get(key, ""))
        if result is None:
            raise HTTPException(404, "构件不存在")
        return result

    @app.get("/api/welds")
    def list_welds(request: Request):
        offset, limit = pagination(request, 1000)
        line = normalize_id(request.query_params.get("line_no", ""))
        # 同一 SQL 取总数与一页数据，避免两次查询间发生并发导入。
        sql = f"""WITH selected AS (SELECT {WELD_FIELDS} FROM weld_records
            WHERE {MODEL_SCOPE_SQL} AND (%s::text='' OR line_no=%s)),
            page AS (SELECT * FROM selected ORDER BY line_no,weld_no OFFSET %s LIMIT %s)
            SELECT (SELECT count(*)::int FROM selected) AS total,
            COALESCE((SELECT json_agg(page ORDER BY line_no,weld_no) FROM page),'[]'::json) AS items"""
        with connect(database_url) as connection:
            result = connection.execute(sql, (*scope, line, line, offset, limit)).fetchone()
        return {"items": [serialize_weld(row) for row in result["items"]],
                "total": result["total"], "offset": offset, "limit": limit}

    @app.get("/api/welds/{line_no}/{weld_no}")
    def get_weld(line_no: str, weld_no: str):
        with connect(database_url) as connection:
            result = connection.execute(f"SELECT {WELD_FIELDS} FROM weld_records WHERE line_no=%s AND weld_no=%s",
                                        (normalize_id(line_no), normalize_id(weld_no))).fetchone()
        if result is None:
            raise HTTPException(404, "焊点不存在")
        return serialize_weld(result)

    @app.put("/api/welds/{line_no}/{weld_no}")
    def update_weld(line_no: str, weld_no: str, body: WeldUpdate):
        with connect(database_url) as connection:
            result = connection.execute(f"""UPDATE weld_records SET welded_on=%s::date,updated_at=CURRENT_TIMESTAMP
                WHERE line_no=%s AND weld_no=%s RETURNING {WELD_FIELDS}""",
                (body.welded_on, normalize_id(line_no), normalize_id(weld_no))).fetchone()
        if result is None:
            raise HTTPException(404, "焊点不存在")
        return serialize_weld(result)

    @app.get("/api/progress")
    def progress():
        with connect(database_url) as connection:
            rows = connection.execute(f"SELECT line_no,weld_no FROM weld_records WHERE {MODEL_SCOPE_SQL} AND welded_on IS NOT NULL", scope).fetchall()
        completed = {(row["line_no"], row["weld_no"]) for row in rows}
        component_ids = set()
        missing_links = set()
        for weld in model["model_welds"]:
            line, number = normalize_id(weld["line_no"]), normalize_id(weld["weld_no"])
            if (line, number) not in completed:
                continue
            for component_id in [weld["component_id"], *weld["side_1_ids"], *weld["side_2_ids"]]:
                if component_id:
                    component_ids.add(normalize_id(component_id))
            for side in weld["missing_sides"]:
                missing_links.add((line, number, side))
        geometry_ids = {geometry for component_id in component_ids
                        for geometry in components.get(component_id, {}).get("geometry_ids", [])}
        total = len(model["model_welds"])
        return {"total_welds": total, "completed_welds": len(completed),
                "percentage": math.floor(len(completed) / total * 10000 + 0.5) / 100 if total else 0,
                "completed_component_ids": sorted(component_ids), "completed_geometry_ids": sorted(geometry_ids),
                "missing_links": [{"line_no": line, "weld_no": number, "side": side}
                                  for line, number, side in sorted(missing_links)]}

    return app


app = create_app()
