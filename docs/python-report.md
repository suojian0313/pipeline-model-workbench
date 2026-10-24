# Python 后端实施报告

入口：`backend-python/app/main.py` 的 `app`；运行命令为 `uv run uvicorn app.main:app --host 0.0.0.0 --port 3002`。Python 3.12.13 环境已经通过 `uv sync --python 3.12` 安装依赖，`uv.lock` 已生成。

## 实现

- 按 `docs/design.md` 提供共享 API、模型静态资源、CORS，以及焊点/进度查询的 `no-store` 缓存头。
- 使用 FastAPI、Pydantic、同步 psycopg 3 binary，无 ORM。普通 `def` 路由在线程池运行，每次数据库操作通过连接上下文完成提交/回滚及关闭。
- 项目路径根据代码文件定位；加载根 `.env`，环境变量 `DATABASE_URL` 保持优先。
- Pydantic 严格拒绝缺失、多余、数字、布尔和非法日历日期字段；分页拒绝小数、科学计数法、重复参数及越界值。offset 上限与 Node 的安全整数上限一致。
- 组件支持业务、几何、叶子树节点三种 ID；进度通过配对 `unnest` 严格限定模型焊点，并合并自身与两侧元件，去重排序；百分比采用与 JavaScript Math.round 对齐的半入舍入。
- `python -m app.cli import` 逐行读取 JSONL、分批写入同一事务，刷新源材料但保留人工日期及其更新时间。`seed-demo` 仅按约定填空，重复运行幂等。

## 验证

先执行未实现的路由和导入入口，观察到 **37 项预期失败**（404 与未实现的导入行为），然后完成实现。

最终运行 `uv run pytest -q --tb=short`：**39 passed**。使用真实 PostgreSQL、唯一 `__python_*` 临时管线，并在 fixture finally 清理。覆盖公共接口、静态资源、组件 ID 映射、CORS、严格日期、分页重复键、持久化、缓存头、精确模型范围、两侧元件与缺失关系、半入舍入与空模型、重复导入保留日期/更新时间、批内重复键、跨批错误回滚和演示数据幂等。上游 Starlette/AnyIO 存在一条弃用警告，不影响测试结果。

已实际运行 `uv run python -m app.cli import`：成功导入 **83,860** 条来源记录，保留已有日期。未启动常驻服务；双服务 3001/3002 的跨语言 HTTP smoke 由主任务统一执行。

学习入口与命令说明见 `backend-python/README.md`；原始附件未修改。
