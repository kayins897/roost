# 分类、列表与收录入口优化 · 2026-10-26

状态：独立分支候选，等待所有者验收；未合 main，未正式发布。
分支：`codex/game-category-ngplus-20261025`，基于前批 `0e2d663`，领域接续提交 `a548883`。本轮后续实现提交见 Git 历史 `feat: integrate game classification and glass list editing`。

## 已完成

- 一级新作开荒/已体验，禁止全空；已体验二级为游玩中、未完待续、新游戏+、收官完结、暂时搁置，也可为空。普通筛选的三种组合、详情/右键/新增/多选共用领域规则。
- 优先级：新作开荒、游玩中、未完待续、新游戏+；评级：新游戏+、收官完结。新游戏+支持两维度同时设置，历史值在暂不适用时保留。表单提交只应用最终分类有资格的等级草稿。
- UI 撤掉通关进度（含旧批量入口和筛选），保留 `completion`/次数/明确完成事件和原始记录；普通日志绝不作为通关次数。明确完成表单不暗改旧进度字段。
- S 闪箔、SS 镭射、SSS 多彩，A 烫金、B 烫银、C 普通；更明显且无网点/网格。保持左上至右下对角光线与略偏右上的光源、原有网格卡片倾斜。
- 相邻筛选/工具成为液态玻璃组，删除双选说明。列表前置等级与完整封面，宽区直接编辑一句话印象；Enter/离开保存，Esc取消。80字校验、失败草稿与导航拦截、原长文保留、只改印象不改测评。
- 列表透镜仅在悬停/聚焦注册，离开且失焦后释放，避免500行各持有滤镜；材质控制器新增属性监听及脱离匹配注销，沿用减少动态/透明度降级。
- Dock “收录作品”文件夹加号整合手动/检索/批量，整理标签移入该面板；初始键盘焦点正确。回收站改 Dock 圆形垃圾桶。移除顶层隐藏入口，设置的数据页保留隐藏作品恢复路线。

## 数据与兼容

无新存储键/启动迁移/整库替换。schemaVersion=1。新二级 `playing` 为可选枚举扩展；旧 `long-term` 读取显示为新游戏+，普通编辑/同步原值不重写，明确重新分类才规范写入。旧历史等级、两维度顺序、客观事实、时长、日志及未知扩展原样保留。

前批同为0.4.24的候选不认识 playing，可能拒读新库，不能交替编辑。回退前保留升级前备份与新版完整导出，使用升级前备份运行旧程序。演示入口使用独立临时目录；本轮测试未接触真实收藏。

## 验证

- `npm test`：212/212。
- `npm run desktop:build`：通过（包含TS类型检查、Vite、主进程构建）。
- `node scripts/verify-library-refinement.cjs`：19组通过、14张实际截图。浏览器真实 LocalStorageRepository + DesktopRepository/合成内存桥双模式；分类矩阵、事实保护、失败/重试、列表80字/取消/持久化、收录/标签/回收/隐藏路线、390/1000/1440布局、同图五级反光、透镜创建释放。不是实际文件桥或真实Steam联网测试。
- 非作者只读审查通过。独立探针确认列表正常离开仅一次保存、失败草稿保留；材质12次往返无滤镜残留；编辑器资格、弹窗焦点修复后复查通过。
- 实际成品验证与包资源一致性结果待随包交付补记。入口 `scripts/verify-refinement-package.cjs <全新验收副本>`、`scripts/verify-package-assets.cjs <全新验收副本>`。
- 本轮没有套用前批206项单测或旧19阶段工作流的成绩。旧GUI脚本存在分类名称/资格/顶部入口断言需要适配，未重跑完整工作流；本轮新专项覆盖改动路径，未访问Steam网络。

## 文件与边界

领域：gameExperience/gameProgress/gameRating/gamePlanning/batchEdit/library/types 及对应单测（含 gameExperienceNgplus）；无持久化/IPC契约变更。
UI：App 接线、workspaceController、WorkEditor、GameProgressPanel/GameRating/CompletionRecordForm、ContextMenu/BulkGradeBar、MediaCard/ListMediaRow/InlineImpression、CollectionHub/useListWritingGuard、BatchEdit、SettingsDialog、glassController、feature样式/tokens。
合成演示库：`build/demo-library.json`（自生成封面与虚构作品，无个人数据）；随包验收：`docs/tasks/library-refinement-preview/验收步骤.md`。

## 接手及回退

1. 确认此分支工作区干净，记录最新SHA；不要在原 `qiyu-desktop` 的用户未提交改动上覆盖。
2. 先核对这里的产品规则，不按历史日志恢复旧进度控件或旧等级资格。
3. 运行上面的单测、构建和专项；需要完整工作流时先适配旧GUI断言，不能简单忽略失败。
4. 变更留在独立分支，非作者审查/所有者验收后再安排主分支集成及发布；本轮没有该权限。
5. 回退源码可检出前批分支；用户数据按上节备份方案回退，禁止重置/清库。

人工验收按随包“验收步骤.md”；Windows500款真实库的列表帧率尚未实机基准测试，减少动态效果时折射/卡面反光按既有设置降级。
