# 试题双后端与 Python 学习版设计

用户已明确要求本轮直接搭建可运行的 Node.js、Python 后端，并保留试题解读和对照学习材料。当前目录无 Git 仓库，直接新增独立目录，不改动试题附件。

## 架构决定

采用 Fastify + TypeScript 与 FastAPI + Python 两套独立 HTTP 服务，共享 PostgreSQL 表结构、接口约定及预处理数据。NestJS 可提供更多模块规范，但本次使用 Fastify 减少同时学习框架概念的成本；Python 采用同步 psycopg 和普通 def 路由，由 FastAPI 线程池执行，便于 Windows 初学者运行。

PostgreSQL 通过本项目独立 Docker Compose 容器运行，绑定 localhost:55439，不复用或改动用户已有数据库。Node 默认 3001、Python 默认 3002，服务监听 0.0.0.0。云端数据库需用户后续提供真实连接串，本次验证本地 PostgreSQL，提供同构云端连接说明。

本文记录双后端阶段的设计。后续已实现 Vue3 + CesiumJS 完整三维前端，补充设计见 frontend-design.md，生产性能与逐题验收见 exam-acceptance.md；云端仍按用户选择仅准备部署配置。

## 共享数据

scripts/prepare_data.py 只读原始附件，以 CSV、structure.json 和 b3dm Batch Table 建立 data/model.json，读取 xlsx 生成 data/welds.jsonl。两版后端使用同一份生成文件，避免两个解析器产生不同解释；预处理单独用 Python 展示 CSV、JSON、二进制和 Excel 的真实用法。

model.json 结构：
- summary：文件/对象/焊点数量与数据质量统计。
- tree：原 structure.roots 数组。
- components：业务构件数组，各项 {id,name,line_no,kind,properties,geometry_ids,bounds,weld_no,material_code,material_1,material_2}。id 为业务节点 hash ID；kind 为原 component_name；bounds 为 {min:[x,y,z],max:[x,y,z]} 或 null。
- geometry_to_component：几何 componentId 到业务 id。
- node_to_component：几何叶子树节点 id 到业务 id。
- model_welds：{line_no,weld_no,component_id,side_1_ids,side_2_ids,missing_sides} 数组。

模型 ID 需通过树上祖先关联业务行；CSV tree_key 的管线和同名构件用 [1]、[2] 兄弟序号区分。聚合 b3dm 中扁平的 boundsMin/boundsMax 每三个数得到构件包围盒。不通过结构文件中已缺失的 GLB 路径加载模型。

业务标识去除空白，但保留原始属性用于展示。编号 '-' 视为缺失关系。使用规范化管线号 + 焊点编号作为焊点唯一键。日期用 ISO YYYY-MM-DD 或 null；演示日期通过显式 seed-demo 命令写入，不改原 Excel。初次导入不自动虚构数据，重复导入保留已有日期。

## 接口契约

统一 JSON snake_case；两个版本均提供以下接口，静态模型都从 /models/tileset.json 加载。

| 方法与路径 | 响应 |
|---|---|
| GET /api/health | {status:"ok",backend:"nodejs"或"python",database:"ok"} |
| GET /api/model/summary | model.summary |
| GET /api/model/tree | {roots:model.tree} |
| GET /api/components?line_no=&search=&offset=0&limit=100 | {items,total,offset,limit}，limit 1..1000 |
| GET /api/components/:id | 一个构件；支持业务 id、几何 componentId、叶子节点 id；未知 404 |
| GET /api/welds?line_no=&offset=0&limit=1000 | 只查本模型焊点；{items,total,offset,limit} |
| GET /api/welds/:line_no/:weld_no | 一条数据库焊点；未知 404 |
| PUT /api/welds/:line_no/:weld_no | 请求 {welded_on:"2026-10-22"或null}；严格校验真实日历日期；响应更新后记录 |
| GET /api/progress | {total_welds,completed_welds,percentage,completed_component_ids,completed_geometry_ids,missing_links} |

weld 记录字段：line_no,weld_no,material_1,material_2,welded_on,updated_at,is_model。日期输出 YYYY-MM-DD 或 null，updated_at 输出 UTC ISO 字符串。状态在每次请求时从数据库读取，不维护后端状态快照。日期更新接口须拒绝缺少字段、额外字段、数字、空串、无效日期。分页参数须为非负整数（limit 正整数）。参数化 SQL，不拼接输入值。

进度按 model_welds 统计；有日期即已焊接，已完成构件集合包含焊缝本身和能找到的两侧元件。去重并排序 id，保证版本间可比较；缺失关系只对已完成焊点报告，格式 {line_no,weld_no,side}。

## 验证

先写双方 HTTP 契约测试，再实现。使用真实 PostgreSQL 验证更新和持久化；共享 smoke 脚本同时启动服务，检查静态 b3dm、属性映射、分页异常、日期校验、更新后另一语言读取、取消完成恢复和进度联动。测试修改在 finally 恢复。再通过另一语言重复导入，确认不覆盖已更新日期。

数据库支持两个服务同时运行；预处理与数据库导入是 CLI 操作，不在 HTTP 请求中解析 8 万行 Excel。HTTP GET 每次读库，浏览器刷新后得到最新状态。模型大对象只在进程初始化时读取。
