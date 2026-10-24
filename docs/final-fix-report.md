# 最终小修记录

- Node `pagination()` 统一验证保留字段 `search` 的字符串类型；`/api/welds?search=a&search=b` 与 components 一样返回 422，即使该路由没有使用 search 过滤。
- 先新增独立契约测试：首跑 **7 通过、1 失败**，明确捕获 welds 返回 200、预期 422；最小实现后 `npm test` **8 通过、0 失败**，`npm run build` 退出 0。
- `学习资料/官方技术资料核对.md` 第 6/8 节改为当前 Fastify + pg 与 FastAPI + 同步 psycopg（普通 def 在线程池执行）的实际架构；NestJS 与异步连接内容标为可选拓展/进阶知识。第 8.5 节改为已创建的 uv 项目环境、pyproject.toml、uv.lock 与 `--locked` 重建方式，保留原官方来源并添加 uv 官方资料链接。
- `学习资料/Python对照Node学习.md` 请求流程段明确 Node 错误体 `{error}` 与 FastAPI `{detail}` 的现状，以及成功数据/约定状态码一致、前端可统一适配；这属于接口选择，不是语言语法差异。
- 未修改 Python 实现、原始附件或其他项目文件；未启动服务。主代理负责重启 Node 并运行最终双服务 smoke。
