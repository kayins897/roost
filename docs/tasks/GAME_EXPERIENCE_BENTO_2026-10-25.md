# 游戏分类与详情 Bento 优化交接（2026-10-25）

状态：REVIEW，等待所有者验收；未合并 main，未正式发布。用户本轮明确授权取代旧的六态/当前游玩关系界面提案，范围仅游戏。

## 分支与边界

- 分支：`codex/game-experience-bento-20261025`。
- 基线：`90ff2bf4df2582454f3334654eba9919e26e4b19`（0.4.24 本地候选）。本轮保持包版本，不冒充正式版本升级。
- 独立工作区 `.worktrees/codex-detail-bento-20261025`；原 `qiyu-desktop` 中 11 个跟踪文件、3 个未跟踪文件的既有修改未被改写、暂存或清理。
- 未读取或操作真实收藏目录、Steam 账号数据；测试全部合成和隔离。未修改工程规范、其他媒体分类、背景材质与主页卡片布局。

## 已落地

1. 一级仅“待体验 / 已体验”两个可组合按钮，双选显示全部，单选不可取消为全空。移除“全部游戏 / 待体验计划”重复入口，隐藏和回收站保留返回入口。
2. 已体验二级：待续、可重玩、长线游玩、已通关、已放下；单值且允许空，提供未分类筛选。五色依次蓝、青、紫、绿、琥珀，配文字；已通关与已放下明确不同。
3. 新增表单、详情原地展开、右键菜单和多选栏均直接选择最终分类；多选栏选择后一次保存，保持选择，可继续整理。优先级沿用 SSS / SS / S / A / B / C，不新增枚举。
4. 原有通关事实、明确完成次数和事件、时间编辑、评级、印象和测评、标签、生命周期操作继续可用。通关事实移入高级筛选，收起后活动计数和可清除摘要仍可见。
5. 居中 Bento：左上完整封面，右上体验、下方两统计；左下较宽印象、右下紧凑足迹；底部长评默认折叠。窄窗单列，图片 contain 保留原比例；无图简洁占位。印象输入/完成表单不造成印象卡片跳高。库封面倾斜保留。
6. 复查修复：菜单方向键不再被误判为页面滚动，列表末件改分类引起滚动钳制仍留在菜单，第一次真正主区滚动正常关闭。Steam 新增预览与自动分类一致，清单导入保留既有 planned 兼容投影，新主次显式选择另行存储。

## 数据契约与兼容

仍为 schemaVersion=1；新增两个可选字段，必选一级通过读模型保证，不要求把所有旧记录补字段：

| 字段 | 值 | 规则 |
| --- | --- | --- |
| experienceStatus | unplayed / experienced | 显式值优先于时长、通关事实及旧状态 |
| experienceCategory | continue / replayable / long-term / completed / put-aside | 仅已体验显示，可缺省；明确设待体验时清二级 |

只读回退（不保存）：正时长、明确通关、正完成次数、旧 playing/ongoing/replaying/cleared 或 playEngagement=playing 支持已体验；仅通用 status 时 active/finished 支持已体验。其余缺省待体验。旧 paused / abandoned / planned / inactive 本身不能证明玩过；没有其他证据时待体验，但原文保留。任何旧二级均不猜测转换；详情提示旧分类供手动整理。

明确选择分类只写新主次字段和修改时间。点击当前推导分类也会固定用户选择；已存储的同值点击不写库。旧 gamePlayState/status/playEngagement 保留；不反投影、不重写旧别名。新建保留原来的兼容投影路径，主次分类独立存储。

分类“已通关”不自动补客观 completion 或次数，反向也不强制改变用户的五种分类；因此长线游玩与已通关/多次完成能并存。普通日志不变成完成事件，不参与次数计算。未记录与明确 0 分别显示。

未体验优先级按新一级判断；手动顺序与评级不清空。评级资格沿用现有明确通关/不适用/历史评级规则；主观已通关但客观未知的卡片仍可进入评级分组的未评级档，不丢卡。明确通关事实后可照常评级。Steam 同步保留显式主次，空时长不覆盖人工分类。清单导入提供自动/直接分类：自动下无证据先待体验，正时长只读归已体验；显式选择优先。

没有启动迁移、批量重写或不可逆转换。现有修订冲突、原子保存、previous/daily/导入前备份仍由原仓储执行。非游戏同名未知扩展不被游戏校验拒读。不能承诺旧版本能正确编辑新分类；回退前分别保留升级前备份和新版完整导出，勿交替编辑。

## 主要修改文件

- domain：`gameExperience.ts` / `types.ts` / `library.ts` / `gameProgress.ts` / `gamePlanning.ts` 及三个分类、分组、排序测试。
- presentation：`App.tsx`、`app/useWorkspaceController.ts`、`features/editor/WorkEditor.tsx`、`SteamLibraryImport.tsx`、`SteamConnect.tsx`。
- 分类和卡片：`features/library/{experienceOptions,gameVisualState,MediaCard,ContextMenu,BulkGradeBar}.tsx/ts`，语义色 `styles/tokens.css`。
- 详情：`features/detail/{DetailPanel,DetailCover,GameExperiencePicker,GameProgressPanel,PersonalWritingFields}.tsx`、`detail.css`；普通日志的紧凑/只读展现复用 `RecordEditors.tsx`。
- 验证：`verify-detail-bento.cjs`、`verify-game-progress.cjs`、`verify-desktop.cjs` 和既有工作区/等级专项的分类适配（实际结果见下）。

## 验证与证据

- 最终 `npm run test:workflow`：19 / 19 通过（2026-10-25 21:45–21:51，本地 Windows x64 / Edge + Electron 45）。被测分支 HEAD `6a2f366`，未提交范围仅本文档；运行时代码 `5578cca`，与免安装预览一致。报告：`evidence/workflow-v0424/2026-10-25T13-45-29-550Z-59888/validation.json`。下面各专项已在最终链重跑，不沿用前批 18 阶段结果。
- `npm test`：206 / 206。
- `npm run desktop:build`：TypeScript、Vite、Electron 主进程构建通过。
- `node scripts/verify-detail-bento.cjs`：25 组，29 张实际运行截图，browser + 真实 LocalStorage / bridge + 真实 DesktopRepository 双模式。覆盖三种一级组合、空二级、五分类、右键/批量/新增、失败零写、事实互不覆盖、展开折叠、未知/0、倾斜及 1440/1000/390 窗口。
- `node scripts/verify-game-progress.cjs`：18 组双模式，完成事件、计数、撤销、评级、同档排序、备份字段/编辑资格等通过。
- `node scripts/verify-desktop.cjs`：9 组原生 Electron 临时目录检查，新增及完整退出重启、分类/旧通关并存、备份往返、损坏恢复及原文备份。
- 等级入口 20 组（包含真实键盘路径及第一次主区滚轮）、分级排序 23 组、主题 7 组、清单导入 9 组；实际 Windows 成品的批量导入 4 组、Steam 隔离模拟同步 7 组通过。Steam 测试为本机拦截的合成数据，不代表真实账号联网。
- 新领域测试另做严格 TypeScript 检查（工程默认不编译 tests）；非作者只读检查指出的排序标签、隐藏通关筛选条件、键盘菜单及同步预览文案均已修正，并增加专项断言。
- 证据 `evidence/detail-bento/validation.json`、`evidence/game-progress/validation.json`、`evidence/source-validation.json`；日志 `evidence/classification-*.log`。截图内封面为合成夹具，不含个人库。

真实库、真实Steam网络同步、跨旧版本交替写入均未验证。其他媒体的产品分类不在本轮范围。

## 本地免安装预览

- 目录：`交付/游戏分类与详情-20261025/QIYU-Preview/`（相对项目根）；双击 `启动演示.cmd` 打开隔离的虚构收藏。用户交付副本没有被自动化启动，保持首次使用状态。
- 构建：`npm run pack` 通过，只生成 unpacked 免安装目录，无安装器；包版本仍为 0.4.24，候选标识 `game-experience-bento-20261025`。
- 运行时代码提交：`5578ccafa83d5695820fb9d57a7a8c8e1d9cb424`；后续提交仅验证和文档。实际资产 `index-DAaq8l2o.js` / `index-CyN5KDCN.css`，`SOURCE.json` 保存来源。
- 成品演示：`verify-demo-package.cjs` 在另一个全新副本执行真实 CMD 入口，8 / 8 通过；保存、完整退出重启、损坏失败保护均实际运行。证据 `evidence/demo-package-v0424/2026-10-25T13-41-10-886Z/validation.json`。
- 一致性：`verify-package-assets.cjs` 对比 ASAR 内 13 个构建文件、外部 5 个演示/说明文件通过。外部本轮演示种子与验收说明跟踪于 `docs/tasks/classification-preview/`；ASAR 内基础演示种子未变，正常库读取不受影响。
- ZIP、校验文件、库/详情/窄窗截图放在同一交付父目录；校验值以 `SHA256SUMS.txt` 为准。只提供预览，不覆盖 `交付/0.4.24` 或正式 release，不推送/发布。

## 人工验收（先用隔离演示）

1. 游戏页点“已体验”形成双选，再取消待体验，只剩已体验；再点已体验不能全空。检查五个二级及未分类，双选恢复全库。
2. 右键任意游戏选长线游玩，再打开详情：主分类高亮；点击原位更改，试已放下和已通关，边框及文字同步；客观通关/时长/次数均不被顺带修改。
3. 多选两款不同分类，底部“体验分类”直接统一，继续给待体验设旧有优先级。检查只有选中作品变化，选择仍保留。
4. 新增一款游戏直接选可重玩或长线游玩，保存。试无时长/0时长，填一句话印象、展开长评后保存并折叠。
5. 在大窗/窄窗看完整封面、统计并列、宽印象、紧凑足迹；普通“添加记录”不会增加完成次数。“记录一次完成”仍为独立动作。
6. 完整退出并重启同一演示入口，检查分类、印象和记录保留。正式库验收前由所有者自行导出备份。

## 接手、集成与回退

先读本文件、`git log 90ff2bf..HEAD` 与任务表；检查分支 clean 后跑上述命令。通过审查及所有者验收前不合 main、不替换旧交付。源码回退到基线仅限独立分支操作；数据回退不靠删字段或降 schema，而保留两份备份，由用户选择恢复。待体验优先级命名仍沿用现有六档，未擅自新增产品决定。
