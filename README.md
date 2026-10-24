# 动力站三维管道模型管理平台

已按试题实现 Vue3 三维工作台、Node.js / Python 两版后端和 PostgreSQL。可加载附件模型、双向选择结构树与构件、查看 EP3D 属性、维护焊接日期，并给完成的焊口及相邻元件着色。右上角可切换两版后端，数据共用。

## 从 GitHub 克隆后准备

仓库包含源码、测试、部署脚本和学习文档。原始试题附件（模型、属性 CSV、焊接 Excel 和试题文档）、生成的 `data/`、本地环境配置、依赖和运行产物不上传。验收文档引用的浏览器原始报告 `docs/browser-results.json` 也只保留在本地。

运行前，请自行取得原始附件，将 `轻量化模型管理平台开发⭐⭐⭐⭐/` 目录放回项目根目录，保留其原始内部结构；可复制 `.env.example` 为 `.env` 后调整本地配置。然后按下方步骤启动，脚本会生成 `data/`；前端开发和构建命令会复制 Cesium 静态资源。只有代码、没有附件时，无法加载本项目的实际模型。

本机运行入口：[打开工作台](http://localhost:8088)。当前局域网地址：[192.168.1.3:8088](http://192.168.1.3:8088)，其他设备需要能访问该主机端口。已验证本机通过此局域网地址访问；尚未用第二台设备实测。

## 一键启动完整应用

安装 Docker Desktop 和 uv，在项目根目录运行：

```powershell
.\scripts\start.ps1
```

脚本准备 Python 环境与数据索引，构建并启动 Nginx、两版后端和数据库，重复导入保留已填写日期。首次镜像下载需要联网；Cesium 资源和 Draco 解码器随应用提供，字体使用系统字体，运行时无需 Cesium ion 或外网地图。

全新数据库的焊接日期为空。可选 `.\scripts\start.ps1 -SeedDemo` 为约三分之一焊点写入演示日期，便于观察着色。本工作区已有 209 / 627 个演示完成日期（33.33%），不是原附件中的实际施工进度。

停止和恢复：

```powershell
docker compose -f compose.yaml -f compose.app.yaml stop
docker compose -f compose.yaml -f compose.app.yaml up -d --wait
```

数据库保存在 Docker 卷中。前端统一从 8088 访问；数据库和后端端口仅绑定本机。端口可在 `.env` 设置 `WEB_PORT`。

## 使用和学习入口

左键拖动旋转，右键拖动平移，滚轮缩放；点击构件查看属性。结构树支持搜索、分组选择与定位；“焊点”页签可筛选完成状态。选中焊口后在右侧保存或清空日期，模型和底部进度随之更新。数据库在外部修改后点击“刷新”。黄色表示选中，绿色表示完成；选中状态优先。部分薄焊口被法兰遮挡时，黄色包围框仍显示其位置。

- [操作、部署和云端配置](docs/deployment.md)
- [逐题验收与性能依据](docs/exam-acceptance.md)
- [试题知识与架构](学习资料/试题解读与架构.md)
- [Python 对照 Node.js 学习](学习资料/Python对照Node学习.md)
- [从源码学习三维前端](学习资料/三维前端实现导读.md)
- [官方资料核对](学习资料/官方技术资料核对.md)

按本次约定，已完成本地功能并准备 `compose.cloud.yaml`；真实云 PostgreSQL 连接与公网部署尚未执行。

## 两版后端与独立开发

下方是脱离容器单独学习后端的命令。完整应用已占用 3001 / 3002 时，先停止相应容器服务再手动启动后端；PostgreSQL 保持运行。只想使用 Python `/docs` 时，直接访问现有的 http://127.0.0.1:3002/docs 即可。

同一套试题数据，提供两个可以分别运行的后端：

- `backend-node/`：Fastify + TypeScript + pg，默认端口 3001。
- `backend-python/`：FastAPI + Python + psycopg，默认端口 3002，带交互式 `/docs`。
- `learning/`：Node/Python 成对的小例子，以及调用两个 API 的 Python 练习。

两版共用 PostgreSQL、接口和构件索引。Node 写入日期，Python 可立即查询；反向亦然。原试题附件保持只读，演示日期写入本项目数据库。

本次已导入 83,860 条记录，并为本模型 627 个焊点中的 209 个设置演示日期，当前完成比例为 33.33%。两版查询与更新已进行跨语言验证，具体结果见 `docs/verification.md`。

建议先读 `学习资料/试题解读与架构.md`，再读 `学习资料/Python对照Node学习.md`。技术来源见 `学习资料/官方技术资料核对.md`。

## 首次准备

需要 Node.js 20+、uv、Docker。Python 项目使用 Python 3.12+，建议先用 3.12。

在 PowerShell 中：

```powershell
cd E:\zprojects\codexpro\shiti
docker compose up -d --wait
uv sync --project backend-python --python 3.12
uv run --project backend-python python scripts/prepare_data.py
```

预处理读取结构树、属性 CSV、52 个 b3dm 和 Excel，生成 `data/model.json`、`data/welds.jsonl`。首次需要运行；只改数据库日期无需重新生成。模型源目录自动定位，不把附件复制进两套应用。

数据库独立运行在 `127.0.0.1:55439`，名称 shiti，默认用户名 shiti、密码 shiti_local，仅用于本地学习。Docker 卷保存数据库状态；停止容器再启动不会丢失日期。

## 运行 Node.js 版

打开一个 PowerShell：

```powershell
cd E:\zprojects\codexpro\shiti\backend-node
npm ci
npm run import
npm run seed-demo
npm start
```

`import` 将 83,860 条焊接记录写入数据库；重复导入保留已经录入的焊接日期。`seed-demo` 是可选的显式演示操作，给约三分之一模型焊点补虚拟日期，并保留已有值；需要初始全空状态时跳过这一步。

访问：

- 健康检查：[Node health](http://127.0.0.1:3001/api/health)
- 一个焊点：[WW-08001-80-QHA 的 1 号焊点](http://127.0.0.1:3001/api/welds/WW-08001-80-QHA/1)
- 进度及着色 ID：[Node progress](http://127.0.0.1:3001/api/progress)
- 模型入口：[tileset.json](http://127.0.0.1:3001/models/tileset.json)

开发时可用 `npm run dev`；编译验证用 `npm run build`，编译后运行 `npm run start:built`。

## 运行 Python 版

另开一个 PowerShell：

```powershell
cd E:\zprojects\codexpro\shiti\backend-python
uv run python -m app.cli import
uv run uvicorn app.main:app --host 0.0.0.0 --port 3002
```

如果已经通过 Node 导入，可直接启动 Python。两版导入命令是替代入口，重复运行都保留日期。Python 的演示数据命令是 `uv run python -m app.cli seed-demo`。

- 交互式接口文档：[Python API docs](http://127.0.0.1:3002/docs)
- 健康检查：[Python health](http://127.0.0.1:3002/api/health)
- 同一个焊点：[Python weld](http://127.0.0.1:3002/api/welds/WW-08001-80-QHA/1)
- 进度集合：[Python progress](http://127.0.0.1:3002/api/progress)

Python 采用普通 `def` 路由和同步 psycopg，FastAPI 在线程池执行这些路由。这个版本方便学习请求、校验、数据库事务和资源释放；异步差异在对照学习材料中说明。

## 立刻做一次跨语言实验

两个服务启动后，用 Node 写入日期：

```powershell
Invoke-RestMethod -Method Put `
  -Uri 'http://127.0.0.1:3001/api/welds/WW-08001-80-QHA/1' `
  -ContentType 'application/json' `
  -Body '{"welded_on":"2026-10-22"}'

Invoke-RestMethod 'http://127.0.0.1:3002/api/welds/WW-08001-80-QHA/1'
```

然后在 Python 的 `/docs` 把日期改为 `null`，再打开 Node 的同一接口。GET 每次查询数据库，网页重新请求即可得到最新数据。

## 共用接口

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | /api/health | 服务和数据库是否连通 |
| GET | /api/model/summary | 实际附件统计 |
| GET | /api/model/tree | 原始结构树 |
| GET | /api/components?line_no=&search=&offset=0&limit=100 | 业务构件分页查询 |
| GET | /api/components/{id} | 属性、几何 ID 与合并 bounds；兼容三种 ID |
| GET | /api/welds?line_no=&offset=0&limit=1000 | 当前模型的 627 个焊点分页 |
| GET | /api/welds/{line_no}/{weld_no} | 查询日期与相邻材料编号 |
| PUT | /api/welds/{line_no}/{weld_no} | 设置真实日历日期或 null |
| GET | /api/progress | 完成数量、比例、构件与几何着色集合、缺失关系 |
| GET | /models/tileset.json | CesiumJS 加载入口 |

日期请求示例：`{"welded_on":"2026-10-22"}` 或 `{"welded_on":null}`。额外字段、缺少字段、空字符串和非法日期返回 422；未知构件/焊点返回 404。完整契约与架构理由在 `docs/design.md`。

前端已按 `completed_geometry_ids` 着色，并在瓦片重载/LOD 切换时重放状态。`bounds` 与 tileset 采用相同坐标变换定位。生产浏览器的 15 秒/20 FPS 验收结果见 `docs/exam-acceptance.md`，性能结论以该报告记录的硬件和测量方式为限。

前端独立开发需要 Node.js 22.12+，两版 API 在线时运行：

```powershell
cd E:\zprojects\codexpro\shiti\frontend
npm ci
npm run dev
```

开发入口为 `http://localhost:5173`，Vite 将两组 API 代理到本机 3001 / 3002。生产构建使用 `npm run build`，单元测试使用 `npm test`。浏览器验收见部署文档，使用真实模型和数据库。

## 局域网和云端 SQL

使用完整 Docker 部署时，其他设备访问“本机局域网 IP:8088”；Nginx 同源代理两版 API。手动运行的后端默认监听 `0.0.0.0`，可按需访问 3001 / 3002。数据库容器只绑定本机。

当前验证使用本地 PostgreSQL。迁移到云 PostgreSQL 时：

1. 在根目录复制 `.env.example` 为 `.env`；完整云部署填写 `CLOUD_DATABASE_URL`，手动运行后端填写 `DATABASE_URL`，不要提交真实密码。
2. 按云服务商要求设置连接 TLS、证书和访问网络，确保两个驱动都能连接。
3. 使用任一版 `import` 命令执行共享 schema 并导入数据；需要建表/导入权限。
4. 完整云部署运行 `docker compose -f compose.cloud.yaml up -d --build`；后续日期刷新直接读云端数据库。详细步骤见 `docs/deployment.md`。

本工程的 HTTP 接口用于本地学习和受信局域网；公开发布前应给写接口接入身份和权限。普通云 SQL 连接信息只放后端，不能写成前端 `VITE_DATABASE_URL`。

## 测试与学习命令

```powershell
cd E:\zprojects\codexpro\shiti
uv run --project backend-python python -m unittest discover -s tests -v
uv run --project backend-python python scripts/smoke_backends.py
node learning/01_node.mjs
uv run --project backend-python python learning/01_python.py
uv run --project backend-python python learning/02_call_api.py
```

共享 smoke 需要两个真实服务在线；会暂时修改一个焊点并在 finally 恢复原日期。两版各自的测试：

```powershell
cd E:\zprojects\codexpro\shiti\backend-node
npm test
npm run build
```

```powershell
cd E:\zprojects\codexpro\shiti\backend-python
uv run pytest -q
```

单后端测试也需要本项目 PostgreSQL，使用专属临时管线记录并清理，不清空原业务表。验证结果记录在 `docs/verification.md`。

停止前台服务按 Ctrl+C。停止本项目数据库用根目录下的 `docker compose stop`；重新运行 `docker compose up -d --wait` 即可恢复。它与本机其他 Docker 项目分开管理。
