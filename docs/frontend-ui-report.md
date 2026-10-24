# 工作台界面实现记录

## 文件与行为

- `frontend/src/App.vue`：整合摘要、原始树、完整构件分页、627 条焊点记录、实时进度与三维视口。结构树分组选择及合并包围盒定位、画布反向定位业务对象、焊点快速列表、日期编辑、手动刷新、Node/Python 数据服务切换、相机工具与性能指标已接入。
- `frontend/src/components/StructureTree.vue`：保留业务层级，隐藏几何叶；平铺可展开行、搜索展开、选择滚动与键盘可访问按钮。
- `frontend/src/components/PropertyPanel.vue`：完整原始 EP3D 字段名/值、空字段显示开关、焊点日期保存和清空、明确的保存结果与错误。
- `frontend/src/lib/api.ts`：未知 JSON 边界校验；组件及焊点完整分页；Node `error` 和 FastAPI 字符串/校验数组 `detail` 适配；编码复合焊点路径；支持 AbortSignal。
- `frontend/src/style.css`：本地字体、深蓝工程工作台、白色侧栏和浅灰画布；窄屏侧栏切换；减少动态效果偏好。
- `frontend/src/lib/api.test.ts`：客户端行为测试。

API 整批加载通过 revision 与 AbortController 阻止旧请求覆盖后端切换后的数据。保存捕获业务对象与请求版本，切换选择不向新对象显示旧结果；保存后重新读取焊点与进度。PUT 已成功但后续读取失败时明确提示“日期已保存，但进度刷新失败”，不将失败伪装成成功。

视口在首屏立即挂载，不等待所有 API；加载失败提供重新挂载模型按钮。操作控件具备验收 data-testid，树行提供业务/分组 data-node-id 和 aria-selected。

## 已执行检查

1. `npx vitest run src/lib/api.test.ts`：先以未实现客户端运行，6 项明确失败。
2. 完成实现后，同命令 6 项通过：完整分页合并、Node 错误、FastAPI 字符串错误、FastAPI 校验明细、编码 PUT 路径与 null 清空、非法成功响应拒绝。
3. `npx vue-tsc --noEmit`：通过，未使用 any 或 ts-ignore。

首轮浏览器集成发现进度加载前模板内 `?? []` 每次渲染生成新数组，使视口样式监听和 metrics 事件形成递归更新。已改为稳定空数组与缓存计算属性；检查其他数组 props，均传递响应式数组或缓存计算属性，没有同类模板临时数组。修复后再次执行 `npx vue-tsc --noEmit` 通过。

按任务边界未执行完整前端构建；主代理负责生产构建和真实浏览器验收。

## 待集成验收

真实 Cesium 画面、树/模型互选与位置、保存/清空后的数据库持久化、双后端切换、布局截图和 FPS 由主代理浏览器流程确认。不能用单元测试代替模型渲染与性能验收。接口数据失败仍保留同一后端上次有效画面并明确显示读取错误；编辑被禁用直到重试成功。后端切换会清空旧业务数据。
