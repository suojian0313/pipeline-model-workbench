# 运行、开发与云端部署

## 本地完整应用

在项目根目录执行 `powershell -File .\scripts\start.ps1`，需要 Docker Desktop 正常运行和 uv。脚本按锁文件配置 Python 3.12；预处理结果缺失时读取原附件生成索引，再启动 PostgreSQL、一次性导入任务、两版后端与 Nginx。默认入口 http://localhost:8088。模型源文件以只读卷挂载，不复制进镜像、不改原附件。

导入程序重复执行保留数据库日期。`-SeedDemo` 是可选演示操作，为约三分之一模型焊点补日期，保留已有值。真实应用时不执行演示命令。本工作区当前已有 209 个演示完成焊点。

同网段浏览器访问 `http://本机IP:8088`，无需安装 Node/Python。端口监听所有网卡，但其他设备能否访问还取决于主机防火墙与网络隔离。当前主机的物理网卡地址是 192.168.1.3；换网络后以新地址为准。

```powershell
docker compose -f compose.yaml -f compose.app.yaml ps
docker compose -f compose.yaml -f compose.app.yaml logs --tail 80 node python web
docker compose -f compose.yaml -f compose.app.yaml stop
docker compose -f compose.yaml -f compose.app.yaml up -d --wait
```

数据库持久化卷为 `shiti-learning_shiti-data`，停止或重建容器不会清除卷。各服务有自动重启策略。不要对学习数据执行 `down -v`，该操作会删除数据库卷。修改源代码后通过 `start.ps1` 重建镜像；仅恢复已构建的应用使用上面的 `up`。

## 端口和服务路径

| 入口 | 用途 |
|---|---|
| :8088/ | Vue3 工作台，唯一需要开放到局域网的端口 |
| :8088/node-api/api/health | 经 Nginx 访问 Node 和数据库健康检查 |
| :8088/python-api/api/health | 经 Nginx 访问 Python 和数据库健康检查 |
| 127.0.0.1:3001 | Node 原始 API，仅本机 |
| 127.0.0.1:3002/docs | Python 交互文档，仅本机；在此练习接口 |
| 127.0.0.1:55439 | PostgreSQL，仅本机，本地学习账号见 compose.yaml |

完整 Docker 环境中 Nginx 通过服务名 `node`、`python` 连接容器，浏览器通过同源前缀访问。前端没有数据库密码。手动开发时 Vite 将相同前缀代理到宿主机的后端端口，页面代码共用。

## 云 PostgreSQL 配置

用户本轮选择先完成本地功能，云端仅准备配置。`compose.cloud.yaml` 是独立配置，不与本地 `compose.yaml` 合并，不创建 PostgreSQL 服务。已验证 Compose 配置解析，没有连接真实云数据库。

1. 在目标服务器准备 Docker、项目代码、`data/` 和原附件目录，保留相对路径。若没有 data，先按 README 运行预处理。目标数据库应为 PostgreSQL，创建数据库与可建表/导入的账号。
2. 在根目录 `.env` 写入云服务提供的 `CLOUD_DATABASE_URL`，配置合适的 `WEB_PORT`。密码中的特殊字符需要 URL 编码。`.env` 不进入镜像和版本控制。
3. 按服务商要求设置数据库网络白名单、TLS 及证书。连接参数应同时被 pg 与 psycopg 支持。例如系统信任的证书可用 `?sslmode=verify-full`；私有 CA 需要另外挂载证书，并分别按驱动要求配置。不要用关闭证书验证来替代配置。
4. 执行下方命令。一次性 import 使用共享 schema 导入 83,860 条记录，不覆盖已录入日期。不要在真实数据库执行 seed-demo。

```powershell
docker compose -f compose.cloud.yaml config --quiet
docker compose -f compose.cloud.yaml up -d --build
docker compose -f compose.cloud.yaml logs --tail 80 import node python web
```

连接示意（替换全部占位符）：

```dotenv
CLOUD_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=verify-full
WEB_PORT=8088
```

启动后验证 `/node-api/api/health` 与 `/python-api/api/health` 均报告 database=ok；在页面通过 Node 保存日期，切 Python 查看并清空，然后从 Node 刷新确认。正式迁移前先备份已有数据库；此配置仅导入原附件数据，不会自动把本机新增的日期搬到另一台数据库。

这份配置提供试题功能的部署基础。公开互联网运行还需要配置域名、HTTPS、写接口身份认证与访问权限；当前实现用于本地和受信局域网，没有账号系统。云资源、凭据与域名尚未配置。

## 验证命令

以下命令在项目根目录执行，后端测试需要本地 PostgreSQL 在线：

```powershell
uv run --project backend-python python -m unittest discover -s tests -v
uv run --project backend-python pytest backend-python/tests -q
uv run --project backend-python python scripts/smoke_backends.py --node http://127.0.0.1:8088/node-api --python http://127.0.0.1:8088/python-api
npm --prefix backend-node test
npm --prefix frontend test
```

真实浏览器验收在 frontend 目录执行：

```powershell
npm ci
npx playwright install chromium
$env:BASE_URL='http://127.0.0.1:8088'
npm run test:e2e
```

也可通过 `CHROME_PATH` 指向已有 Chromium。Windows 会自动识别 Playwright 本机浏览器缓存。性能测量默认使用实际 GPU，需开启浏览器硬件加速；可用 `SOFTWARE_GL=1` 诊断软件渲染，但不能把软件渲染结果与 GPU 结果混写。测试报告生成在 `frontend/test-results/results.json`，日期测试会暂时修改一个焊口并在 finally 恢复。
