"""从代码文件确定项目位置，所以从任意工作目录启动都能找到数据。"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env", override=False)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://shiti:shiti_local@127.0.0.1:55439/shiti")


def load_model() -> dict:
    try:
        return json.loads((PROJECT_ROOT / "data/model.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise RuntimeError("无法读取 data/model.json；请先在项目根目录运行 python scripts/prepare_data.py。") from error
