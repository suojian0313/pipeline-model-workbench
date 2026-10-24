# 双后端实现计划

目标：可运行的 Node.js、Python 后端，加上围绕本试题的中文知识扩展与语言对照。

架构与公共契约见 design.md。附件保持只读；当前目录非 Git 仓库，不建立额外 worktree。

- [x] Task 1 公共准备：Docker Compose 与 PostgreSQL schema；Python 预处理脚本；先写小型夹具测试，验证兄弟序号、一对多映射、扁平 bounds、空白编号和缺失端点。
- [x] Task 2 Node 后端：Fastify + TS + pg；依照 design.md 接口；先写行为测试并运行红灯，再实现服务、导入/演示 CLI。只写 backend-node/。
- [x] Task 3 Python 后端：FastAPI + psycopg；同接口；先写行为测试并运行红灯，再实现路由、仓储、导入/演示 CLI。只写 backend-python/。
- [x] Task 4 集成：启动独立 PostgreSQL，导入原始 83860 行，两服务同时启动；运行共享 smoke 验证跨语言更新、日期清空、SQL 参数、分页、模型静态资源和已焊接两侧着色 ID；修复差异。
- [x] Task 5 学习交付：README 启动与云数据库步骤，试题逐题解读，Node/Python 对照与练习；审查后复跑必要验证，将结果记录 verification.md。

全局约束：两版默认端口 3001/3002；数据库 55439；snake_case；日期真实且严格为 ISO date/null；不修改试题原件；不将本地数据库表述为已完成云端部署；不宣称未做的三维性能验收。
