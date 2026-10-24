# 双后端验证记录

日期：2026-10-22。环境：Windows PowerShell、Node.js 22.23.2、uv 管理的 Python 3.12、独立 Docker PostgreSQL 17。

## 测试与构建

| 检查 | 最新结果 |
|---|---|
| 共享预处理 unittest | 4 通过，0 失败 |
| Node npm test | 8 通过，0 失败、0 跳过 |
| Node npm run build | 退出 0 |
| Python uv run pytest -q --tb=short | 39 通过，0 失败 |
| Python compileall | 退出 0 |
| 双服务 scripts/smoke_backends.py | PASS |
| 57 个原始附件 SHA256 | 与联调前记录全部相同 |

Python 测试有一条上游 Starlette/AnyIO BlockingPortal 别名弃用警告，不影响本次测试；未通过屏蔽警告隐藏它。

## 真实数据与跨语言验证

- 本项目 PostgreSQL：`127.0.0.1:55439/shiti`，不复用其他项目数据库。
- 数据库保留 83,860 条焊接记录；模型相关 627 条。
- 模型索引：1,791 个业务对象，7,154 个可渲染几何 ID，9,342 个树节点，52 个实际 b3dm。
- Node 服务在 3001、Python 在 3002：health、summary、tree、构件属性、静态 tileset/b3dm、焊点与进度接口均经过真实 HTTP 验证。
- 在 Node 更新日期后，Python 立即读到；在 Python 修改为有效闰日后，Node 立即读到；清空后完成数量及进度集合恢复。
- 两版的进度响应完整相同，包括业务 ID、几何 ID、缺失关系和两位小数比例。
- 日期严格校验：错误日历日期、不完整格式、空串、数字、缺少字段、额外字段均返回 422。
- 分页非法小数、指数、负数、重复 limit、过大 limit、超过 JS 安全整数的 offset 均返回 422；未知对象返回 404。
- 收尾统一保留 search 的重复参数处理，两版列表入口均返回 422；Node 重启后真实双服务 smoke 再次 PASS。
- SQL 注入样式的管线输入未绕过查询过滤。
- 虚拟日期通过 Node seed-demo 显式写入 209 条；Python seed-demo 随后写入 0 条，证明重复执行不会覆盖已有日期。
- 先后通过 Node、Python 全量重导各 83,860 条后，逐项比较所有 627 条模型记录的日期与 updated_at，全部保留。
- 带演示日期的真实双服务 smoke 再次 PASS；最后数据库共 83,860 行、627 条模型行、209 条非空日期。

当前演示 `/api/progress` 返回：627 总焊点、209 已完成、33.33%；对应 621 个业务构件和 1,447 个几何 ID。当前完成集合包含 1 个缺失端点报告，来源是原始 `-` 占位；未猜测替代对象。

## 审查与范围

公共准备与 Node 的独立审查见 `preparation-review.md`，Python 与整体审查见 `final-review.md`。红绿实现记录分别在 `node-report.md`、`python-report.md`。

最终整体审查通过，发现的两项轻微文案/参数差异已经修复并独立复核关闭；8 + 39 + 4 共 51 项测试通过。

本文是双后端阶段的验证记录。本地 PostgreSQL 已验证；真实云数据库需配置连接串并按供应商要求接入。后续完整网页三维浏览、树与模型交互、实际着色和 15 秒/20 FPS 已另行实现与验收，最新结果见 exam-acceptance.md。该报告保留实际环境与云端边界，不以本文的后端测试替代浏览器验收。
