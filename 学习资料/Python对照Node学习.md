# 用这个试题从 Node.js 过渡到 Python

先运行两个后端，再打开对应文件阅读。它们处理相同请求，连接同一张表；你能把已经理解的后端工作直接对应到 Python。

本项目采用 Fastify + TypeScript 与 FastAPI + Python。共享数据准备使用 Python，既避免重复解释附件，也提供 CSV、JSON、Excel 和二进制处理的实例。你不需要先熟悉 Python 的所有语言特性。

## 先建立语法对应

| TypeScript / Node.js | Python | 需要注意 |
|---|---|---|
| const / let | 直接赋值 | Python 无同等的 const 关键字 |
| null / undefined | None | 字典缺键与值为 None 仍有区别 |
| true / false | True / False | 首字母大写 |
| === / !== | == / != | 身份比较用 is，例如 value is None |
| object / Record | dict | JSON 数据常转换成 dict |
| Array | list | list 可变；tuple 常用于固定组合和 SQL 参数 |
| Set / Map | set / dict | 空集合是 set()；{} 是空字典 |
| function / 箭头函数 | def / lambda | 常规业务逻辑优先 def |
| import/export | import / from ... import | 模块由文件组织，不需要 export 每个函数 |
| try/catch/finally | try/except/finally | 异常类型放在 except 后面 |
| JSON.parse/stringify | json.loads/dumps | load/dump 版本直接操作文件对象 |
| fs/promises + path | pathlib.Path | 文件对象适合配合 with 关闭 |
| Promise.all | asyncio.gather | 任务错误与取消行为需要单独学习 |
| npm + package.json | uv + pyproject.toml | uv 管项目依赖和 Python 环境 |
| node_modules | .venv | .venv 里含解释器与依赖，避免污染系统环境 |

先看 `learning/01_node.mjs` 和 `learning/01_python.py`，执行结果相同。代码涵盖编号清洗、字典、列表、集合和函数，是后端真实逻辑的缩小版。

## 一组最贴近你经验的代码

Node.js：

```js
function normalizeCode(value) {
  const result = String(value ?? '').replace(/\s+/g, '');
  return result === '-' ? '' : result;
}
const key = `${lineNo}|${weldNo}`;
const completed = records.filter(row => row.welded_on !== null);
```

Python：

```python
def normalize_code(value):
    result = re.sub(r"\s+", "", str(value if value is not None else ""))
    return "" if result == "-" else result

key = (line_no, weld_no)
completed = [row for row in records if row["welded_on"] is not None]
```

缩进在 Python 中定义代码块，不是排版习惯。上面的 tuple `(line_no, weld_no)` 可以直接作为字典键，避免字符串分隔符冲突。代码和 API 中使用 snake_case 是 Python 常见约定。

`str | None` 表示可能是字符串或 None。但普通 Python 函数的类型注解不会自动校验传入值；FastAPI 的请求模型通过 Pydantic 才提供运行时校验。TypeScript 类型也会在编译后消失，不能替代后端对 HTTP 输入的验证。

## 请求如何流过两个后端

Node 版：请求 → Fastify 路由 → 校验 → `await pool.query()` → PostgreSQL → 序列化 JSON。

Python 版：请求 → FastAPI 路由/Pydantic → 普通 `def` 在线程池执行 → psycopg 查询 → PostgreSQL → 序列化 JSON。

两者采用同一分层：配置、模型索引、数据库访问、路由和导入 CLI。先在 Node 找到查询一个焊点的路径，再在 Python 找同名 URL，就能沿着熟悉的流程读代码。

当前错误返回结构是 Node 的 `{error}` 与 FastAPI 的 `{detail}`，成功数据和约定状态码一致，前端可统一适配错误结构；这属于接口实现选择，不是语言语法差异。

FastAPI 的装饰器 `@app.get(...)`、`@app.put(...)` 把下面的函数注册为路由。装饰器是“注册/包装这个函数”的语法，不需要为了读懂这些路由先掌握元类等高级特性。

本轮选择普通 `def` 配合同步驱动，让数据库 I/O 在线程池运行。把同步查询直接塞进 `async def` 会阻塞事件循环，不能通过函数名称自动变成异步。[FastAPI 并发说明](https://fastapi.tiangolo.com/async/)

## SQL 不变，驱动调用改变

Node pg：

```ts
const result = await pool.query(
  'SELECT * FROM weld_records WHERE line_no=$1 AND weld_no=$2',
  [lineNo, weldNo],
);
const weld = result.rows[0];
```

Python psycopg：

```python
with psycopg.connect(database_url, row_factory=dict_row) as conn:
    weld = conn.execute(
        "SELECT * FROM weld_records WHERE line_no=%s AND weld_no=%s",
        (line_no, weld_no),
    ).fetchone()
```

Python 的 `%s` 是驱动的占位符，不是在 SQL 里自己执行字符串格式化。两种写法都把 SQL 和输入分开，避免 SQL 注入。单个参数的 tuple 要写 `(value,)`，少逗号只是括号表达式。[psycopg 参数说明](https://www.psycopg.org/psycopg3/docs/basic/params.html)

`with` 管理资源生命周期；数据库连接上下文正常结束提交事务，发生异常则回滚，并关闭连接。这使“修改成功返回”和“发生异常撤销”与代码结构结合起来。导入脚本在事务中批量写入；重复导入采用 UPSERT，但保留已更新的焊接日期。

本轮 Python 以每次请求获取连接的方式保证请求间隔离，结构容易理解。更高并发时可引入 psycopg_pool，并理解池大小、超时、事务和依赖释放。Node 使用连接池复用连接。不要把同一数据库会话随意并发共享给多个请求。

## 日期是一个容易忽视的跨语言问题

本题焊接日期属于日历日期，应采用 PostgreSQL `DATE`、Python `datetime.date` 和接口字符串 `YYYY-MM-DD`。`2026-10-22` 本身不代表某个 UTC 时间点。

- `null` 表示未焊接，可用于清空日期。
- 非空值必须是真实日期，`2026-02-30` 应被拒绝。
- Python 的日期对象可被驱动绑定；JSON 输出时变成 ISO 日期字符串。
- Node 驱动如果把 DATE 转成 JS Date，再跨时区格式化，可能出现前后偏一天；本项目显式保持日期字符串。
- 更新时间 `updated_at` 才是带时区时间戳，与施工日期分开处理。

## 理解 async 时不要直接套用 Promise 经验

JavaScript 调用 async 函数，会开始执行函数体，返回 Promise。Python 调用 `async def` 先得到 coroutine，尚未开始执行，需 await 或交给事件循环调度。[Python asyncio 文档](https://docs.python.org/3/library/asyncio-task.html)

```python
async def fetch_weld():
    return {"weld_no": "1"}

coroutine = fetch_weld()  # 创建协程对象
result = await coroutine  # 此时执行；这行需位于 async 函数中
```

学习顺序可以是：先普通 def 与同步服务 → 看懂异步 I/O 的等待问题 → 改用异步驱动与连接池 → 学习任务并发与取消。Windows 上异步驱动还涉及事件循环兼容性，本轮同步路线避免先陷入运行环境细节。

## 使用 uv 管理环境

在项目根目录运行：

```powershell
uv sync --project backend-python
uv run --project backend-python python learning/01_python.py
uv run --project backend-python python scripts/prepare_data.py
```

运行服务时进入 Python 项目目录，按根 README 的命令启动。`uv run` 会使用该项目的虚拟环境，不需要手动切换 PATH。可先用 `uv python list --only-installed` 查看可用解释器。

Windows 的 `python` 命令可能只是 Microsoft Store 占位程序。解释器由 uv 管理时，优先使用 `uv run python ...`；这是环境定位问题，与 Python 代码是否正确无关。

依赖声明在 pyproject.toml，uv.lock 锁定解析结果。对照 Node 的 package.json 与 package-lock.json 阅读；不要手动把系统 Python 的 site-packages 复制进项目。

## 按业务练习 Python

1. **读取对象**：调用 `/api/components?limit=3`，打印每个对象的管线号和 kind。用字典访问与 for 循环完成。
2. **读取文件**：用 csv.DictReader 读取属性 CSV，筛选 `component_name == "Weld"`，独立算出 627。先不要阅读完整预处理算法。
3. **建立索引**：用 `(line_no, weld_no)` tuple 作键，将 627 个模型焊点与 Excel 关联，记录未匹配项。期望模型侧未匹配数为 0。
4. **调用 API**：运行 `learning/02_call_api.py`，对比两个服务的同一焊点。然后阅读它如何处理 HTTPError。
5. **更新状态**：在 Python 的 `/docs` 将一个焊点日期设为 `2026-10-22`，去 Node API 查询；再清空日期，检查 `/api/progress`。
6. **读测试**：找非法日期、未知构件、重复导入不覆盖日期的测试，理解为什么只测试“接口返回 200”不够。
7. **做小扩展**：增加“某管线完成/未完成数”接口。先在 Node 写你熟悉的版本，再用 Python 重写；确保两版返回相同字段。

建议阅读源码顺序：配置 → 获取单个焊点 → 更新日期 → 构件查询 → 进度聚合 → 导入脚本 → prepare_data.py。二进制解析和完整树遍历放在后面，先用现有接口获得反馈。
