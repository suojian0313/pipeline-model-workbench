import json
import struct
import tempfile
import unittest
from pathlib import Path

try:
    from scripts import prepare_data as prepare
except ImportError:
    prepare = None


class PreparationTests(unittest.TestCase):
    def require_module(self):
        self.assertIsNotNone(prepare, "尚未实现共享预处理模块")

    def test_identifier_normalization_handles_internal_spaces_and_placeholder(self):
        self.require_module()
        self.assertEqual(prepare.normalize_code(" 90EL100 GB13401 -627 "), "90EL100GB13401-627")
        self.assertEqual(prepare.normalize_code(" - "), "")
        self.assertEqual(prepare.normalize_code(1), "1")

    def test_binary_batch_table_retains_flattened_bounds(self):
        self.require_module()
        ft = json.dumps({"BATCH_LENGTH": 1}).encode()
        bt = json.dumps({"componentId": ["g1"], "boundsMin": [1, 2, 3], "boundsMax": [4, 5, 6]}).encode()
        payload = struct.pack("<4s6I", b"b3dm", 1, 28 + len(ft) + len(bt), len(ft), 0, len(bt), 0) + ft + bt
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "tile.b3dm"
            file.write_bytes(payload)
            self.assertEqual(prepare.read_b3dm(file)["boundsMin"], [1, 2, 3])

    def test_repeated_sibling_names_map_to_separate_business_objects(self):
        self.require_module()
        nodes = [
            {"id": "p1", "name": "Pipe", "children": [{"id": "n1", "name": "Geometry", "componentId": "g1", "children": []}]},
            {"id": "p2", "name": "Pipe", "children": [{"id": "n2", "name": "Geometry", "componentId": "g2", "children": []}]},
            {"id": "w1", "name": "Weld", "children": [{"id": "nw", "name": "Geometry", "componentId": "gw", "children": []}]},
        ]
        tree = {"id": "line", "name": "L", "children": nodes}
        for node_id, name in [("unit", "U"), ("project", "P"), ("02", "02"), ("root", "R")]:
            tree = {"id": node_id, "name": name, "children": [tree]}
        prefix = "R/02/P/U/L[1]/"
        rows = [
            {"tree_key": prefix + "Pipe[1]", "component_name": "Pipe", "EP3D_管 线 号": " L ", "EP3D_元件编号": " A -1 "},
            {"tree_key": prefix + "Pipe[2]", "component_name": "Pipe", "EP3D_管 线 号": "L", "EP3D_元件编号": "B-2"},
            {"tree_key": prefix + "Weld[1]", "component_name": "Weld", "EP3D_管 线 号": "L", "EP3D_焊点编号": "1", "EP3D_元件1编号": "A-1", "EP3D_元件2编号": "B -2"},
        ]
        batch = {"componentId": ["g1", "g2", "gw"], "boundsMin": [1, 2, 3, 10, 20, 30, 4, 5, 6], "boundsMax": [2, 3, 4, 11, 21, 31, 5, 6, 7]}
        model = prepare.build_model({"roots": [tree]}, rows, [batch], "assets")
        self.assertEqual(model["geometry_to_component"], {"g1": "p1", "g2": "p2", "gw": "w1"})
        self.assertEqual(model["node_to_component"]["n2"], "p2")
        self.assertEqual(model["model_welds"][0]["side_1_ids"], ["p1"])
        self.assertEqual(model["model_welds"][0]["side_2_ids"], ["p2"])
        second = next(item for item in model["components"] if item["id"] == "p2")
        self.assertEqual(second["bounds"], {"min": [10, 20, 30], "max": [11, 21, 31]})

    def test_invalid_dates_cannot_silently_become_completed_welds(self):
        self.require_module()
        self.assertEqual(prepare.iso_date(None), None)
        self.assertEqual(prepare.iso_date("2026-10-22"), "2026-10-22")
        with self.assertRaises(ValueError):
            prepare.iso_date("2026-02-30")


if __name__ == "__main__":
    unittest.main()
