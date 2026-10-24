# Python 后端

在 `backend-python` 目录运行（先按项目根 README 启动独立 PostgreSQL 并预处理数据）：

```powershell
uv sync --python 3.12
uv run python -m app.cli import
uv run uvicorn app.main:app --host 0.0.0.0 --port 3002
```

打开 [交互式 API 文档](http://localhost:3002/docs)。模型入口是 `/models/tileset.json`。

显式生成演示日期：`uv run python -m app.cli seed-demo`。仅为每三个模型焊点中的一个填充空日期，重复运行保留已有日期。普通启动与导入均不会自动生成演示日期。

运行真实数据库测试：`uv run pytest -q`。默认连接项目独立的 `127.0.0.1:55439/shiti`，测试使用唯一的 `__python_*` 管线并在结束后清理；不要将测试的 `DATABASE_URL` 指向其他数据库。环境变量优先于根目录 `.env`，默认连接串与 Node 版一致。

建议按以下顺序阅读：

1. `app/domain.py`：函数、类型注解、Pydantic 模型与字段校验器。
2. `app/config.py`：`pathlib`、环境变量与 JSON 文件。
3. `app/db.py`：数据库连接上下文、参数化 SQL、日期序列化。
4. `app/main.py`：路由装饰器、分页、查询与集合进度计算。
5. `app/data.py`：逐行读 JSONL、分批 upsert、事务和异常回滚。
6. `app/cli.py`：命令行参数与 `if __name__ == "__main__"`。
7. `tests/test_contract.py`：pytest fixture、参数化测试和真实数据库验证。

路由使用普通 `def`；FastAPI 在线程池执行它们，因此同步 psycopg 不阻塞事件循环。数据库连接用 `with` 在每次请求结束时提交或回滚并关闭。只有添加 HTTP 缓存头的中间件使用 `async def`，初学时可以先从普通路由开始读。
