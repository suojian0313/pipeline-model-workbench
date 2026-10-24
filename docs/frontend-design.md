# 完成试题的三维工作台设计

本轮按用户“根据试题开发完成”继续已有双后端项目；用户明确选择先完成本地全部功能，并准备云端部署配置。本地不冒充云端验收，交付可接云 PostgreSQL 的部署覆盖文件与说明。

## 界面设计规格

目的：面向管道施工审阅者，在一个页面浏览动力站模型、定位构件、核对 EP3D 属性、维护焊接日期与查看施工进度。

视觉方向：industrial/utilitarian，工程审阅工作台。主画面是真实三维管道，不使用营销式卡片或装饰图。深蓝顶部工具条、浅灰侧面板、低对比蓝灰画布，以完成和选中颜色突出实际工程状态。

色板：深蓝 #153047，面板 #ffffff，背景 #edf2f6，分隔线 #d8e2e9，完成 #18a97b，选中 #edb34a。字体标题 Bahnschrift，正文 Microsoft YaHei UI，数字 Consolas，均本机字体，不依赖外网。图标使用 lucide-vue-next。默认尊重 reduced-motion。

布局：顶部56px工具条；左侧280px结构树，中间弹性三维画布，右侧320px属性面板；底部紧凑状态栏与颜色图例。窄屏可收起左右面板。右侧选中焊点时直接编辑日期，非焊点显示元件属性。

## 技术与行为

Vue3 + TypeScript + Vite + CesiumJS。使用本地 Workers/Assets/ThirdParty，不使用在线底图或 ion 服务。模型以 tileset.json 与 b3dm 原格式加载。局部工程坐标通过统一 ENU 变换显示，相机与包围盒使用同一矩阵，任意参考原点仅用于渲染，不宣称真实地理定位。

API 从 /node-api 或 /python-api 代理，默认 Node；切换后重新读取日期与进度，三维资源仍为原模型。静态生产版本由 Nginx 代理两个后端，默认8088，可局域网访问。Compose app profile 构建并启动完整应用，独立服务健康检查与重启策略保证退出聊天后仍可使用。

结构树基于原始树保留层级，业务对象下的几何片段折叠为同一个可选择对象；父分组选择包含其后代业务对象。树和模型共享选中业务ID。模型点击对应feature.componentId查业务索引，树自动展开并滚动。相机focus使用后台合并bounds。

颜色优先级：选中 > 已焊接及两侧元件 > 原始外观。显式 REPLACE 避免原色乘法影响状态含义；部分薄焊口在法兰内被遮挡，为所选业务对象绘制真实 bounds 黄色轮廓，depthFailMaterial 提示遮挡中的位置。保存日期后刷新进度；日期清空时重新计算整个集合。瓦片重载时按稳定ID重放样式。对4个原始缺失端点如实提示。

请求失败显示明确原因与重试，日期保存中禁重复点击。切换选择或后端时防止旧请求覆盖新对象。成功数据/状态码统一；Node error 与 FastAPI detail 均在客户端适配。

## ModelViewport 与界面接口

组件 frontend/src/components/ModelViewport.vue 接受：apiBase:string、components:Component[]、selectedIds:string[]（业务ID）、completedGeometryIds:string[]、progressVisible:boolean。

事件：select(geometryId:string|null)、ready()、metrics(ViewerMetrics)、error(message:string)。

暴露方法：home()、focusBounds(bounds:Bounds)、zoom(factor:number)、setView(view:'iso'|'top'|'front')、orbit(delta:number)、pan(dx:number,dy:number)。factor小于1放大。组件元素提供data-ready、data-selected-feature-count与data-progress-feature-count，供真实浏览器验收读取，避免把引擎内部对象放到全局。

ViewerMetrics：fps:number|null、frameMsP95:number|null、firstVisibleMs:number|null、initialLoadedMs:number|null、visibleFeatures:number、selectedVisibleFeatures:number、progressVisibleFeatures:number。

## 验收

生产构建通过；真实浏览器冷缓存加载，记录首次模型有效画面与初始视角完整载入，目标小于15秒；持续拖动/旋转/缩放期间按Cesium实际postRender采样FPS，目标不低于20，报告环境和帧耗时。静止按需渲染不记作低FPS。

端到端覆盖：树选择高亮/定位、画布点选反向定位树/属性、父分组选择、元件属性、焊点日期保存/清空、刷新后保留、后端切换、完成与两侧着色、LOD移动后颜色重放、无效日期/错误恢复。测试修改在finally恢复。离线外网拦截时仍可加载模型和工作台。
