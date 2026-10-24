"""psycopg 同步连接：with 正常退出提交，异常退出回滚，最后总会关闭。"""
from datetime import date, datetime, timezone

import psycopg
from psycopg.rows import dict_row

from app.domain import normalize_id

WELD_FIELDS = "line_no,weld_no,material_1,material_2,welded_on,updated_at,is_model"
MODEL_SCOPE_SQL = "(line_no,weld_no) IN (SELECT * FROM unnest(%s::text[],%s::text[]))"


def connect(database_url: str):
    return psycopg.connect(database_url, row_factory=dict_row)


def model_scope(model: dict) -> tuple[list[str], list[str]]:
    welds = model["model_welds"]
    return ([normalize_id(weld["line_no"]) for weld in welds],
            [normalize_id(weld["weld_no"]) for weld in welds])


def serialize_weld(row: dict) -> dict:
    result = dict(row)
    welded = result["welded_on"]
    if isinstance(welded, date):
        result["welded_on"] = welded.isoformat()
    updated = result["updated_at"]
    if isinstance(updated, str):
        updated = datetime.fromisoformat(updated.replace("Z", "+00:00"))
    result["updated_at"] = updated.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return result
