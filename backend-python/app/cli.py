"""uv run python -m app.cli import / seed-demo；HTTP 启动不自动导入或生成日期。"""
import argparse

from app.config import DATABASE_URL, PROJECT_ROOT, load_model
from app.data import import_welds, seed_demo


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["import", "seed-demo"])
    args = parser.parse_args()
    if args.command == "import":
        count = import_welds(DATABASE_URL, PROJECT_ROOT / "data/welds.jsonl")
        print(f"已导入 {count} 条焊点；已有焊接日期保持不变。")
    else:
        count = seed_demo(DATABASE_URL, load_model())
        print(f"已写入 {count} 条演示日期；已有日期保持不变。")


if __name__ == "__main__":
    main()
