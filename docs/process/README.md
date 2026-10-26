# 阅读指南与开发接手入口

> 2026-10-25。B0/B1 基线与协作落地；未来 Agent 从此进入，不要求重读历史聊天。

仓库根是包含 `package.json`、`AGENTS.md`、`src/`、`desktop/` 的目录。本机外层草案、导入与私密备份不属于仓库，不整目录上传。

## 最短阅读顺序

1. [AGENTS](../../AGENTS.md)：红线、角色、独立分支和写入规则。
2. [任务表](../tasks/README.md)：范围、依赖、分支/SHA、第一步操作。
3. [产品需求](../product/PRD.md) 的相关条目；[章程](../product/PROJECT_CHARTER.md) 了解定位。
4. [能力基线](../product/CAPABILITY_BASELINE.md)：已有功能和证据，避免重复开发。
5. [ADR](../DECISIONS.md)、[架构](../ARCHITECTURE.md)、[数据兼容](../../DATA_COMPATIBILITY.md) 的相关部分。
6. [WORKFLOW](../../WORKFLOW.md) 当前流程；开始前复制 [任务/交接模板](TASK_TEMPLATE.md)。

未决项查 [Decision Backlog](../product/DECISION_BACKLOG.md)。历史来源在 [基线审阅报告](../next-iteration/00-baseline-review-2026-10-25.md)；正式基线落地后它是历史采样，不是第二套规范。

本批源码与脚本实际验证结果见 [2026-10-25 去敏摘要](VALIDATION_2026-10-25.json)，范围与回退见 B0/B1 任务，不要求访问原机器的忽略日志。

## 唯一事实来源

| 问题 | 正文入口 |
| --- | --- |
| 定位/非目标 | 项目章程 |
| 业务规则与验收 | PRD；未决变更只进入 Decision Backlog |
| 当前能力 | 能力基线 + 源码/被测提交/验证摘要 |
| 重大决定 | ADR，标明接受/取代/历史及来源 |
| 开发与接力 | AGENTS 红线 + WORKFLOW 当前流程；本目录只导读和提供模板 |
| 当前工作 | 任务表和任务文件；Issue/PR 补充讨论 |
| 版本/历史证据 | CHANGELOG / WORKFLOW 历史段 / 本机原始报告 |

决策状态与实现证据分别记录。源码说明实际行为，批准需求说明目标；冲突先查原因，不能自动改数据，也不能把竞品研究直接变成 PRD。

## 领取与接力

- 先核对 `git status --short`、分支/HEAD 与 `package.json`；基于已审查提交建立独立 worktree。原工作区未提交成果不等于远端已有内容。
- DeepSeek 可独立领取 READY 任务，Zcode/GLM 做有明确终点的工作；无 Agent 固定层级所有权。Codex 离线也继续分支开发与独立评审，合并权限见 WORKFLOW。
- 原始证据、真实数据与私密交接保持忽略；任务内提交去敏结果、命令、未验证项和下一步。不要命名为被忽略的 `docs/ZCODE_*.md`。
- 不预建八套空 SOP。需求进入、开发、审查、接力和集成先用同一模板，发布/数据变更按触发补细则。

来源：外层 01～05 草案和所有者对审阅报告的确认。01～04 对应产品目录；05 有效内容落入 WORKFLOW 与本指南。外层原草案保留、不删除，后续以仓内正文为准。
