# 当前能力基线

> 核查日期：2026-10-25｜应用版本：0.4.23｜状态：源码事实及分级验证证据。
>
> 源码采样提交：`637e6b597984b35383fe5528b38bab5828f2f32c`。功能核查覆盖 `src/`、`desktop/`，不读取真实收藏。文档落地不表示未来候选功能已实现。

## 版本、分支与证据边界

| 项目 | 采样事实 |
| --- | --- |
| Git 根 | 包含 `package.json`、`src/`、`desktop/` 的仓库目录；外层项目工作区不是 Git 根 |
| 分支 | 审阅时原工作区为 `dev/0.4.15`，但内容是 0.4.23；分支名不代表应用版本 |
| 采样 HEAD | 上列 SHA；审阅时本地 `main` 与远端 `main` 同提交 |
| 技术 | Electron 45、React 19、TypeScript、Vite、本地 JSON；`schemaVersion: 1` |
| 未提交接续成果 | 原工作区已有 11 个修改文件、2 个新增脚本，集中于测试入口/CI/package 脚本和文档；生产 `src/`、`desktop/` 相对该 HEAD 无差异 |
| 本文文档提交 | 本文所在提交可由 Git 查询；不将文档提交号混作功能采样号。B0 验收入口集成状态以任务记录为准 |
| 发行偏好 | Windows 免安装 ZIP；本批不生成、发布或覆盖新成品，B0 的源码构建与验收另列 |

本文件记录的是**采样时点**，不是永久声称远端、分支或工作区保持不变。后续功能或验收入口变更时，更新对应事实、提交和证据；不要凭最新版本号重写全部历史。

## 源码确认的能力

| 范围 | 现有实现 | 边界 / 不应误报为完成 | 证据 |
| --- | --- | --- | --- |
| 四板块 | 收藏新增编辑、封面、喜欢、当前板块搜索、网格/列表 | 非游戏进度尚无专属语义；搜索不是全库跨板块搜索 | [类型](../../src/domain/types.ts)、[工作区](../../src/presentation/App.tsx) |
| 作品与平台 | 同作品可关联多平台、外部编号判重 | 同名不能自动认定相同作品，冲突不能强合并 | [资料合并](../../src/domain/catalog.ts)、[Steam 同步](../../src/domain/steamSync.ts) |
| 游戏状态 | 六个可选状态：待体验、游玩中、已通关、持续游玩、暂时搁置、已放弃 | `replaying` 是兼容旧值，不是第七个独立选项；无全成就/白金 | [状态规则](../../src/domain/library.ts)、[类型](../../src/domain/types.ts) |
| 优先级/评级 | 独立六档 SSS/SS/S/A/B/C、分档折叠、同级拖动持久化；优先级/收录时间/名称/年份/时长正反序 | 持续游玩保留原评级但不能直接编辑；特殊评级箔面只用于当前已通关 | [计划排序](../../src/domain/gamePlanning.ts)、[通用排序](../../src/domain/librarySort.ts)、[评级入口](../../src/presentation/features/detail/GameRating.tsx) |
| 时长与详情 | 卡片与详情先时长后状态；未知与零区分；中央详情、客观资料折叠 | 当前活动与曾通关尚未独立建模 | [卡片](../../src/presentation/features/library/MediaCard.tsx)、[详情](../../src/presentation/features/detail/DetailPanel.tsx) |
| 快捷编辑 | 右键状态、时长、标签、资料、喜欢、隐藏/回收等；待体验/已通关在菜单内联设等级（ZD-01 候选，含 N0 修复，采样 2026-10-25 夜间分支 zcode/nightly-20261025，未进 main） | 持续游玩等状态无菜单等级入口（与详情资格一致） | [右键菜单](../../src/presentation/features/library/ContextMenu.tsx)、[组合入口](../../src/presentation/App.tsx) |
| 短长文 | 80 码点单行短印象、独立长测评；旧长文只读派生且保留原文 | 打开详情不自动拆写旧文，未输入不补新字段 | [写作规则](../../src/domain/personalWriting.ts) |
| 标签 | 玩法/题材/游玩场景/其他；去重、改名合并、删除关联、批量增删、筛选 | **组内 AND、跨组 AND**；无 OR 开关、转组、独立空标签目录/同义词；创建需选择作品分配 | [筛选规则](../../src/domain/library.ts)、[标签管理](../../src/presentation/features/tags/TagManager.tsx)、[批改](../../src/domain/batchEdit.ts) |
| 生命周期 | 多选操作、隐藏、回收、恢复、回收站确认永久删除、来源排除避免重导 | 放弃状态不自动删除；隐藏与回收不是体验状态 | [生命周期](../../src/domain/lifecycle.ts)、[排除编号](../../src/domain/importExclusions.ts) |
| 体验历史 | 手动开始/进展/完成/随记，月/日精度、编辑删除、本次分钟数 | 无自动事件、周目/胜利统计；记录分钟不自动累加，也不自动改状态 | [记录编辑](../../src/presentation/RecordEditors.tsx)、[类型](../../src/domain/types.ts) |
| 导入 | TXT、Steam JSON、`qiyu.batch.v1`、预览、去重、只新增 | 不是整库恢复入口；不接收外来个人评级覆盖私人记录 | [导入规则](../../src/domain/steamImport.ts) |
| Steam 连接 | 免费官方 API Key 设置、账号解析、库存/时长、封面资料补全、同步预览、可选加密保存 Key | 本轮不证明真实账号数量、在线可见性或完整同步；mock 不是线上账号验收 | [桌面连接](../../desktop/steam.ts)、[同步合并](../../src/domain/steamSync.ts) |
| 元数据 | Steam 名称搜索及商店 URL，豆瓣书籍/影视 URL，候选确认、补缺保护 | 无豆瓣名称搜索、通用后台刷新、逐字段人工锁定；已有请求取消、回退、两路补全和部分限流保护，不是从零建设 | [来源适配](../../desktop/metadata.ts)、[资料合并](../../src/domain/catalog.ts)、[Steam 补全](../../desktop/steam.ts) |
| 视图 | 临时搜索筛选、待体验计划视图 | 没有命名保存规则的智能视图；切板块时会清筛选 | [工作区控制](../../src/presentation/app/useWorkspaceController.ts) |
| 外观 | 深色、多色背景、流体/星河/视差、导航液态玻璃与操作毛玻璃独立配置、设置 Dock、过渡、分级反光、回顶 | 本轮未重验动态效果，60Hz 是目标；不能据此宣称所有设备稳定 60 帧 | [背景](../../src/presentation/AmbientScene.tsx)、[玻璃](../../src/presentation/glassKit.ts)、[封面深度](../../src/presentation/useCoverDepth.ts) |
| 保存与恢复 | 校验、修订冲突、同目录原子替换、previous、首写 daily 留 7 份，恢复替换前原文；未知字段保留 | 桌面批量追加走 previous/daily；浏览器追加/替换前为单槽备份。同 schema 不保证旧程序可安全写新字段 | [桌面存储](../../desktop/store.ts)、[浏览器存储](../../src/infrastructure/localStorageRepository.ts)、[兼容约定](../../DATA_COMPATIBILITY.md) |

以上功能应增量维护，不能因为新任务书再次提及而从零重建。

## 架构进展与未完成部分

依赖分层与共享 [IPC 契约](../../src/shared/ipc-contract.ts) 已存在；App 已提取 feature/controller，token 文件和组件样式已开始收敛。不能沿用历史“尚无共享契约”的描述。

`useFieldState` 内部采用 reducer，但还是字段更新函数，不等于 ADR-007 的显式收藏业务 action 已完成。旧 `styles.css`、`theme.css`、`cinema.css` 仍被加载，不能声称样式覆盖债务已全部清理。后续只按任务触及范围小步改善，不因 Agent 变化更换框架、状态库或持久化。

## 验证记录

| 证据等级 | 日期与结果 | 限制 |
| --- | --- | --- |
| 源码核查 | 2026-10-25，以上采样提交的生产源码及来源审阅 | 证明实现入口和逻辑边界，不替代运行结果 |
| 本轮自动化 | 主代理于 2026-10-25 在 Windows / Node 24.19.0 / npm 11.17.0 执行 `npm test`：167 通过、0 失败、0 跳过，退出码 0 | 被测为原工作树；生产源码与上述 HEAD 无差异。存储测试使用临时目录；非 GUI、构建、成品或真实联网验收 |
| 历史工作流 | 本机 2026-10-24 的 0.4.23 报告记录 15 阶段通过 | 对应上一轮工作树；采样 HEAD 的入口仍是旧 11 阶段，15 阶段及两个新脚本须经 B0 审查集成 |
| 历史成品/视觉 | 已有 0.4.23 ZIP 及定向验证记录 | 本次文档任务未重新构建、启动、验收或发布 ZIP；不能冒充当前成品已复测 |
| 未验证 | 托管 CI、真实账号联网、规模性能、读屏器及人工使用验收 | 本机或 mock 通过不能替代这些结论 |

**B0 候选更新（2026-10-25）：** 验收入口已在 `prep/baseline-20261025` 的 `626231c4e157274a611ce8baab5d74826d4b0338` 收纳，主分支尚未合并。新 worktree 执行 `npm ci`、显式 `setup:desktop` 后完整 15 阶段通过（含 167 单测与源码构建），完整评级专项 22 项、最终专项 4 项通过。首次因缺 Electron EXE 失败、随后直连超时的记录保留；本机使用官方校验的缓存安装，不能声称直连下载或托管 CI 已通过。完整去敏结果见 [验证摘要](../process/VALIDATION_2026-10-25.json)，任务边界见 [B0](../tasks/B0.md)。以上更新验证入口，不改变前表生产功能采样。

原始 `evidence/`、发布目录及私密本地交接不入库。可交接的测试摘要须记录命令、被测提交/差异、时间、环境及范围，不让接手者只能依赖本机原始日志。B0 后新增的验证结果写入对应任务/验收摘要并更新本节，不覆写成先前已通过。

## 下一轮入口

已确认先完成 B0 接续成果审查、B1 正式基线及交接文档。状态/完成成果、右键内联等级、标签语义、智能视图和来源增强的后续任务依据 [PRD](PRD.md)、[待决策清单](DECISION_BACKLOG.md)与[流程入口](../process/README.md)推进；候选项不自动授权。
