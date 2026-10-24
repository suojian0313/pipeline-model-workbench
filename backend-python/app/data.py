"""JSONL 分批写入，但整个文件只有一个事务，任意一行失败都全部回滚。"""
import json
from pathlib import Path

from app.config import PROJECT_ROOT
from app.db import connect
from app.domain import normalize_id, valid_date

UPSERT_SQL = """INSERT INTO weld_records(line_no,weld_no,material_1,material_2,welded_on,is_model)
    VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(line_no,weld_no) DO UPDATE SET
    material_1=EXCLUDED.material_1,material_2=EXCLUDED.material_2,is_model=EXCLUDED.is_model"""


def validate_row(value: object, number: int) -> tuple:
    if not isinstance(value, dict):
        raise ValueError(f"JSONL 第 {number} 行不是对象")
    for field in ("line_no", "weld_no", "material_1", "material_2"):
        if not isinstance(value.get(field), str):
            raise ValueError(f"JSONL 第 {number} 行 {field} 必须是字符串")
    line, weld = normalize_id(value["line_no"]), normalize_id(value["weld_no"])
    if (not line or not weld or type(value.get("is_model")) is not bool
            or "welded_on" not in value
            or (value["welded_on"] is not None and not valid_date(value["welded_on"]))):
        raise ValueError(f"JSONL 第 {number} 行标识、日期或 is_model 非法")
    return line, weld, value["material_1"], value["material_2"], value["welded_on"], value["is_model"]


def import_welds(database_url: str, file: str | Path, batch_size: int = 1000) -> int:
    if type(batch_size) is not int or not 1 <= batch_size <= 5000:
        raise ValueError("batch_size 必须在 1..5000 之间")
    count = 0
    # ON CONFLICT 只刷新源材料字段，人工日期和更新时间均保留。
    with connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute((PROJECT_ROOT / "shared/schema.sql").read_text(encoding="utf-8"))
        batch = {}
        with Path(file).open(encoding="utf-8") as source:
            for number, text in enumerate(source, 1):
                if not text.strip():
                    continue
                row = validate_row(json.loads(text), number)
                batch[(row[0], row[1])] = row
                count += 1
                if len(batch) >= batch_size:
                    cursor.executemany(UPSERT_SQL, list(batch.values()))
                    batch.clear()
        if batch:
            cursor.executemany(UPSERT_SQL, list(batch.values()))
    return count


def seed_demo(database_url: str, model: dict) -> int:
    changed = 0
    with connect(database_url) as connection:
        for index, weld in enumerate(model["model_welds"]):
            if index % 3:
                continue
            day = f"2026-10-{index % 28 + 1:02d}"
            result = connection.execute("""UPDATE weld_records SET welded_on=%s::date,updated_at=CURRENT_TIMESTAMP
                WHERE line_no=%s AND weld_no=%s AND welded_on IS NULL""",
                (day, normalize_id(weld["line_no"]), normalize_id(weld["weld_no"])))
            changed += result.rowcount
    return changed
