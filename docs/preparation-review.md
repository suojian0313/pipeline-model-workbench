# 数据准备与 Node.js 后端独立审查

审查日期：2026-10-22。只读审查实现与原始附件；未修改实现、附件或生成业务数据。执行测试并写入本报告。构建仅更新编译产物。

## Task 1：公共数据准备

范围：`docs/design.md`、`scripts/prepare_data.py`、`tests/test_prepare.py`、`shared/schema.sql`、`compose.yaml`，以及实际附件、`data/model.json`、`data/welds.jsonl`。

**Spec compliance：通过。** 未发现需要阻止继续集成的重要偏差。

**Quality：通过。** 对本题现有附件，映射、聚合和清洗有一致的规则，错误数据采取显式失败；没有按不存在的生产复杂度提出扩展要求。

已执行的核对：

- `tests.test_prepare`：4 个测试通过，0 失败。
- 独立遍历原始结构树并重建带兄弟序号的 CSV 路径，逐项核对 1791 个业务对象的原始 EP3D 属性。存在 1376 次构件层同名兄弟的第二个及后续出现，序号映射一致。
- 独立读取全部 52 个 b3dm 的 Batch Table，逐项检查 7154 个导出 geometry ID 的祖先业务归属；与 `geometry_to_component` 完全一致。全部原始几何节点到 `node_to_component` 的归属也一致。
- 按每个 ID 的扁平数组三元组读取 bounds，再跨瓦片、跨几何求并集，与每个业务构件的 bounds 完全一致；所有 bounds 都是三个有限数字、min 不大于 max。1791 个业务对象均有导出几何。
- 原结构包含 7506 个 geometry ID，352 个未导出到 b3dm；输出准确报告，不将这 352 个伪装为可渲染几何。
- 原始焊点两侧编号中 28 处空白被正确规范化，原始属性保留；4 个 `-` 占位引用转为空值，实际缺失关系为 4 个 side 2，没有出现空值互相匹配。
- 原 Excel 活动工作表共 83860 条记录，焊接日期全部为空。JSONL 共 83860 条、联合键唯一，其中 627 条属于本模型、0 条已焊接；没有自动制造示例日期。
- 使用临时真实 xlsx 补测空日期、Python date、datetime、ISO 日期字符串、内部空白、`-` 占位及无效日历日期；导出结果符合设计，无效日期被拒绝。临时文件随测试清理。
- schema 的联合主键、DATE、TIMESTAMPTZ 与共享契约一致；Compose PostgreSQL 17 使用独立卷，端口仅绑定 `127.0.0.1:55439`，不复用其他数据库。

重跑基本测试：

```powershell
& 'C:\Users\zhangjian\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest tests.test_prepare -v
```

边界：原 Excel 没有非空焊接日期，所以非空日期转换通过临时 xlsx 验证；本审查不声称已完成前端加载速度、帧率或三维定位效果验收。

## Task 2：Node.js 后端

范围：`backend-node/src`、`backend-node/test`、`backend-node/package.json`，对照 `docs/design.md` 与 `docs/node-report.md`。Python 后端尚在实现，未据未完成代码提出跨语言缺陷。

**Spec compliance：通过。** 所列 HTTP 路由、三类构件 ID 查询、分页、真实日期校验、模型焊点范围、进度聚合、日期保留和演示数据显式触发符合已定契约。

**Quality：通过。** 未发现需要修复的重要问题。SQL 输入使用绑定参数，导入使用同一个 client 的单一事务，失败后回滚；大 Excel 不在 HTTP 请求期间解析。源码边界对当前教学规模合理。

独立验证：

- `npm test`：7 个测试通过，0 失败、0 跳过，连接真实本地 PostgreSQL。覆盖分页异常、非法日期、更新/取消与进度、既有日期保留、后续批次失败回滚和重复 seed。
- `npm run build`：退出码 0。
- 逐项审查 `MODEL_SCOPE_SQL` 使用两列数组配对展开，避免管线号和焊点号分别 IN 而混入交叉组合；单条焊点 GET/PUT 按设计允许访问库内已存在的其他焊点，不能把这一行为误判为模型范围泄漏。
- DATE 保留字符串，updated_at 转 UTC ISO；列表计数和分页来自同一次查询快照。GET 焊点/进度禁缓存。进度包括焊缝和可关联两侧元件，缺失边只为已完成焊点报告。
- 导入冲突更新来源属性，不覆盖已有 welded_on、updated_at；演示 seed 只补空日期且幂等。

重跑：

```powershell
Set-Location E:\zprojects\codexpro\shiti\backend-node
npm test
npm run build
```

剩余集成验收：两后端同时启动后，用相同查询/异常输入和可恢复的日期更新核对响应、百分比舍入、排序、缺失关系格式，以及一端更新后另一端立即读到。这是尚待执行的集成步骤，不是本次已发现的缺陷。
