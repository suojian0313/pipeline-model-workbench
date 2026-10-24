# Node.js 后端实施与验证记录

## 运行

Node.js 20+，当前验证环境 Node.js 22.23.2。项目使用 Fastify、TypeScript、pg 与 Fastify 官方 CORS/静态文件插件；不使用 NestJS。

```powershell
cd E:\zprojects\codexpro\shiti\backend-node
npm install
npm run import
npm start
```

默认监听 `0.0.0.0:3001`；环境变量 `PORT` 可覆盖端口。数据库默认为 `postgresql://shiti:shiti_local@127.0.0.1:55439/shiti`，支持环境变量 `DATABASE_URL` 和项目根 `.env`。`npm run seed-demo` 是显式演示命令：仅给本模型按顺序每三个焊点中的第一个补日期，保留所有已有日期。正常启动及导入不会自动添加演示日期。

`npm run build` 编译后可用 `npm run start:built`。`PROJECT_ROOT` 由 `import.meta.url` 定位，对源码和 dist 都适用；不依赖进程工作目录。静态模型目录读取 `model.source.asset_dir`，挂载 `/models/`。

## 实现

- `src/app.ts` 导出异步 `buildApp()`；HTTP 入口为 `src/server.ts`，命令行为 `src/cli.ts`。
- 模型只在创建应用时加载，内存索引支持业务 ID、几何 componentId、树叶子节点 ID。
- `GET /api/welds` 与进度使用 `model_welds` 的管线/焊点配对键限制模型范围；单条 GET/PUT 支持库内已存在焊点。
- 日期更新严格只接受一个 `welded_on` 字段，其值为真实 ISO 日历日期或 null；缺失、额外字段、类型错误、无效日历日期返回 422。分页拒绝小数、指数、负数、重复值和超范围 limit。
- SQL 全部参数化；列表总数和数据页由单次 SQL 快照产生。焊点/进度 GET 返回 `Cache-Control: no-store, max-age=0`。
- PostgreSQL DATE 类型读取为字符串，避免时区偏移；时间戳输出 UTC ISO。进度 ID 去重排序，包含焊缝业务构件、两侧业务构件及其几何 ID；缺失关系仅报告已完成焊点，side 为整数 1/2。percentage 四舍五入到 2 位。
- 导入流式读 JSONL，默认每批 1000 条参数 SQL，整个导入只有一个事务；无效行会回滚此前批次。重复键只更新来源属性，不改已有焊接日期和日期更新时间。同批重复键保留末行来源属性。
- 源码中以中文注释解释了根路径、日期类型、数组参数模型范围、事务、导入冲突和 JSONL 生命周期。

## 测试红绿证据

1. 先写真实 PostgreSQL + `fastify.inject` 契约测试，只留最小实现骨架；第一次 `npm test`：**0 通过、5 失败**。分别捕获内部空白未归一化、错误接受非闰年 2 月 29 日、缺失 health 接口、分页错误返回 404、日期更新错误返回 404。
2. 完成 HTTP 与领域实现后：**5 通过、0 失败**；`npm run build` 退出 0。
3. 再写导入和 seed 测试，保留空骨架：**5 通过、2 失败**。导入行数实际 0/期望 1；seed 完成数量实际 1/期望 4。
4. 流式实现暴露 readline 提前消费小文件的问题。独立最小复现显示 reader 在开始迭代前已经 close，造成待决 await；将 reader 创建放到事务/DDL 等 await 之后并立即消费。
5. 最终 `npm test`：**7 通过、0 失败、0 跳过**，包含真实 DB 导入日期保留、跨批事务回滚、幂等 seed；`npm run build` 退出 0。

测试仅使用本项目 `127.0.0.1:55439/shiti`（或明确传入的 DATABASE_URL），临时记录有独立 `__node_*__` 管线前缀并在 finally/after 删除；测试不清空业务表。

## 实际数据验证

- `npm run import` 导入 **83860** 行，命令退出 0。
- 在 `C:\Users\zhangjian` 作为工作目录，直接导入编译后的 `dist/app.js`，`buildApp()` 成功加载项目模型；health、summary、指定几何属性、焊点分页、progress、tileset.json、b3dm 全部 200。
- 真实模型 weld 列表 total 为 **627**；静态 b3dm 长 **186524** 字节且 magic 为 `b3dm`。
- 将真实 `WW-08001-80-QHA/1` 暂设为 `2024-02-29`，再次导入全部 **83860** 行，查询日期仍为 `2024-02-29`；finally 恢复原 welded_on 和 updated_at。
- 未启动常驻 HTTP 服务，留给主代理统一启动两个后端和执行共享 smoke；未对真实模型运行 seed-demo，初始业务日期没有被演示命令更改。

## 边界

本阶段验证 Node 单后端和真实本地 PostgreSQL；跨 Python/Node HTTP 联动由主代理最终验证。未声称前端 15 秒或 20 FPS 指标。服务面向本地学习，未增加账号/权限系统；依赖已锁定在 package-lock.json。
