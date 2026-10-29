# 栖域 · QIYU / Roost

本地优先的个人文娱收藏与体验管理应用。当前版本 **v0.4.36 预发行**，优先支持 Windows x64，包含游戏、书籍和影视；音乐入口暂时撤下，历史收藏仍保留。

[下载免安装版](https://github.com/kayins897/roost/releases/tag/v0.4.36) · [更新说明](CHANGELOG.md) · [本版验收步骤](docs/release/验收步骤-0.4.36.md) · [开发接手指南](docs/process/README.md)

## 当前功能

- **游戏收藏与规划**：Steam 主动读取／预览同步、多平台属性、分组标签、字母游玩优先级与独立 0–10 个人评分。封面／列表、状态色、评分分段与同档手动排序；右键评分保留草稿，结束编辑后保存重排。
- **个人游戏档案**：彩色 Bento 小组件，逐卡右键编辑，可调整布局、大小、颜色与显隐。封面、时长、最后运行、体验足迹、一句话印象及折叠长文分别展示；完成记录与普通体验日志不互相推算。
- **游戏截图**：复制保存原图，来源文件移动或删除不影响相册；单图／四宫格／九宫格及大图浏览。完整备份携带截图原图。
- **阅读管理**：全部／想读／在读／已读／闲置／弃读、封面与列表、七维筛选、标签、主题书单、可折叠年度阅读热力表。阅读分钟、读完轮次、未来安排和逐次感想分别记录。
- **影视管理**：电影／连续剧／番剧一级切换；电影想看／看过与多刷，剧集想看／在看／看过及季集进度，电影主题片单。普通观看日志不等同于看完。
- **收录与整理**：手动收录、单件资料检索、批量清单／CSV／TSV／JSON、预览纠错与去重；书籍有效 ISBN-10／13 等价识别。豆瓣确切作品链接可主动补空缺资料，失败暂停、停止与逐条重试；不覆盖人工内容。
- **本机外观**：中文／English、离线随包字体、主题背景、导航液态玻璃和普通磨砂控件。游戏卡面保留镭射／多彩，可关闭、统一材质或按评分区间设置。

全局日历、阶段规划和立体全息封面目前仍是 `design/` 下的独立实验，不属于正式应用已完成能力。版本演进和历史设计取舍见 [CHANGELOG](CHANGELOG.md)；历史候选文档中的分类名、材质映射或发布状态不能替代本版说明。

## 开始使用

1. 从 Releases 下载 `Qiyu-NoInstall-0.4.36-x64.zip` 与 `SHA256SUMS.txt`，核对散列后完整解压，保留全部程序文件。
2. 可先双击「启动演示.cmd」体验合成收藏。演示使用独立数据目录，重复打开保留演示中的修改。
3. 使用真实收藏前，在旧版导出完整备份并退出旧程序，再双击「栖域.exe」。正常模式沿用 `%APPDATA%\QIYU`，无需重新导入。

免安装版不需要安装 Node.js 或启动服务器。旧版仍在运行时，新 EXE 可能只唤醒旧窗口，请核对界面版本。本项目目前没有后台自动更新。

Dock「收录作品」集中手动／检索／批量入口；标签筛选旁的加号可创建并分配标签。垃圾桶按钮再次点击可退出回收站，永久删除需确认。新增隐藏入口已撤下，历史隐藏记录仍能在设置找回，不自动删除或重新导入。

## 导入来源与边界

Steam 需要公开的游戏详情及本机配置的免费 Steam Web API Key，读取后预览确认；本地／离线清单导入不依赖密钥。去重和导入排除保留，平台只是作品属性。

书籍与影视可先使用 CSV／TSV 模板、名称清单或 `qiyu.batch.v1` JSON；确切豆瓣链接按需读取资料，不根据书名猜作品，不登录豆瓣／微信读书，不抓整份网页书单。在线来源可限流或拒绝访问，离线草稿可继续核对和导入。详细格式见 [批量导入](BATCH_IMPORT.md)。

## 数据、备份与回退

收藏保持 `schemaVersion: 1`，启动不自动迁移、补写或规范化。手动分类优先于时长推断，未记录与实际 0 分别保留，保存沿用修订检查、临时文件与原子替换。

- 桌面通过设置导出单个 `.roost` 完整备份，包含收藏与截图原图；旧 JSON 继续兼容，但不携带外置截图。
- `%APPDATA%\QIYU` 保存收藏、托管截图和本机备份，包含 previous、最近 7 份 daily，以及整库恢复前的原文。自动备份仍在同一设备，应定期另存完整导出。
- 新版有旧版不了解的可选扩展。同一 schema 不表示可以安全交替写入；升级前留备份，回退前另存新版完整导出，用旧版打开备份副本。
- 语言、字体及外观属于本机偏好，不自动改写收藏内容。移除卡片或截图引用不擅自清除历史备份需要的原图。

具体限制见 [数据兼容约定](DATA_COMPATIBILITY.md)。

## 开发与验证

React 19、TypeScript、Vite、Electron 45；当前开发与桌面验证使用 Windows x64、Node.js 24 和 npm。

```powershell
npm ci
npm run setup:desktop
npm test
npm run desktop:build
npm run desktop
```

当前定向验证入口（桌面测试使用临时目录与合成数据）：

```powershell
node scripts/verify-batch-intake.cjs
node scripts/verify-books-controls-import.cjs
node scripts/verify-screens.cjs
node scripts/verify-interface-preferences.cjs
node scripts/verify-score-bands.cjs
node scripts/verify-game-card-controls.cjs
node scripts/verify-bento-materials.cjs
```

本版已完成 294 项单测、类型／构建及对应源码／成品专项。测试范围、独立审查及未验证项见 [0.4.36 验收记录](docs/tasks/BATCH_INTAKE_V0436_ACCEPTANCE.md) 和 [累计发布说明](docs/release/RELEASE-v0.4.36.md)。在线资料自动化使用合成响应，不等同于真实账号或实时网络验收。

手动 GitHub CI 使用当前专项；托管运行结果以 Actions 为准。旧 `npm run test:workflow` 保留了历史卡面和分类断言，尚未整体适配，不能宣称本版完整套件通过。默认 `npm run dist:zip` 只做免安装包；只有明确授权后合入 main 并推送版本标签才触发预发行，见 [发布流程](docs/release/PUBLISHING.md)。

## 架构与协作

依赖方向为 `presentation → domain ← infrastructure`；`desktop/` 提供类型化 IPC、原子文件仓储与受限来源访问。领域纯函数不做 I/O，UI 经仓储与契约访问数据。大改、数据覆盖和兼容性决策先评审，不因 Agent 更换而替换核心架构。

接手先读 [AGENTS](AGENTS.md)、[架构](docs/ARCHITECTURE.md)、[产品基线](docs/product/PRD.md)、[任务表](docs/tasks/README.md) 与 [工作流](WORKFLOW.md)。独立分支／工作树开发，非作者审查，合并和发布需所有者明确授权；不提交真实收藏、密钥、私人清单或本机原始测试证据。

仓库源码公开，应用许可证仍为 `UNLICENSED`，尚未由所有者选定开源许可证。本轮不变更许可证。第三方字体与设计参考各自适用其来源说明，见 [字体许可](public/fonts/README.md)、[材质参考核对](design/holo-card-reference/SOURCE-README.md) 与各设计目录的许可文件。
