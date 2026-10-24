# 三维工作台实现计划

- [x] F1 建立前端项目、共享类型、API与树/选择/包围盒逻辑测试，完成Cesium加载与相机/拾取/样式生命周期。
- [x] F2 实现Vue工作台、结构树、属性/日期编辑、后端切换、进度与错误恢复，接入ModelViewport约定接口。
- [x] F3 Docker构建双后端和Nginx前端，提供局域网长期运行入口、云PostgreSQL部署覆盖配置和启动命令。
- [x] F4 生产构建与真实浏览器验收，记录冷加载/FPS、双向联动、日期跨后端更新/刷新、进度与离线资源；修复并复查。
- [x] F5 独立代码审查、更新试题验收表和使用/学习说明，明确本地完成与云端待配置边界。

完成证据：exam-acceptance.md、browser-results.json、workbench-review.md。用户已明确云数据库本轮只准备部署配置。

工程不是Git仓库，新增frontend/和部署文件，不复制或修改原始附件。职责隔离：主代理编写ModelViewport、Cesium类和公共模型算法；UI代理只编写App.vue、样式、结构树/属性面板与API客户端。接口见frontend-design.md。
