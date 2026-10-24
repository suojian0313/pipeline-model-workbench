"""与 01_node.mjs 做相同的事；运行它不需要启动数据库。"""
import json
import re


def normalize_code(value):
    code = re.sub(r"\s+", "", str(value if value is not None else ""))
    return "" if code == "-" else code


welds = [
    {"line_no": " WW-08001 ", "weld_no": "1", "welded_on": "2026-10-22", "sides": ["pipe-a", "flange-b"]},
    {"line_no": "WW-08001", "weld_no": "2", "welded_on": None, "sides": ["pipe-a", "pipe-c"]},
]
completed = [weld for weld in welds if weld["welded_on"] is not None]
colored = {component for weld in completed for component in weld["sides"]}
result = {
    "normalized_code": normalize_code("90EL GB13401 -627"),
    "weld_key": (normalize_code(welds[0]["line_no"]), welds[0]["weld_no"]),
    "completed": len(completed),
    "colored_components": sorted(colored),
}
print(json.dumps(result))
