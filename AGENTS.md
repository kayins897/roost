# AGENTS.md — 栖域工程规约

## 项目目标

栖域（QIYU）是本地优先、以个人体验为核心的文娱收藏管理应用。一级板块：游戏、书籍、影视、音乐；游戏最优先。Windows 优先，Android 与同步后置。首要用户价值是快速统一收录、有效筛选、个人印象与体验回顾。

## 当前负责人（2026-10-24 起）

- 写入负责人：GLM-5.3（2026-10-24 接任）。前任 Agent 交付的 0.4.13/0.4.14 已原样捕获为快照提交 `5179707`（分支 `dev/0.4.15`）。
- 经项目所有者确认，恢复**受限**多 Agent 协作：DeepSeek Harness 仅负责 `src/domain/` 与 `desktop/`（含各自 `*.test.ts`）；GLM-5.3 负责 `src/presentation/`、`src/infrastructure/`、样式、集成与发布。`src/presentation/App.tsx` 与 `src/infrastructure/repository.ts` 为 GLM-5.3 单写入者文件；契约相关文件（如 `desktop/preload.ts`）改动须协调时间片，同文件不并发写。
- 历史代码由 Codex 迭代至 0.4.12，已整体纳入 Git 版本控制（完整历史与 tag `baseline-0.4.12` 保留在所有者本机私密备份；公开仓库为隐私清理后的单一基线，见 `docs/GITHUB_SETUP.md`）。
- 多 Agent 并行写入任务同时不超过两条；恢复或调整协作前，必须先按 `docs/ARCHITECTURE.md` 与 `docs/DECISIONS.md` 的归属划分执行。

## 真实状态优先

- 每次任务前先读当前 `README.md`、`docs/ARCHITECTURE.md`、`package.json`、`git status`，**不得假定文档里的版本是现状**。
- 文档与代码冲突时以代码和实测结果为准，并顺手修正文档。
- 未实际运行的测试必须标为「未验证」，不得用代码生成成功冒充验收通过。

## 架构红线（详见 docs/ARCHITECTURE.md）

1. 依赖方向单向：`presentation → domain ← infrastructure`，`desktop` 只依赖 `domain`。禁止 UI 直接访问文件系统、`%APPDATA%`、网络或 `window.qiyuDesktop`。
2. `domain` 必须是纯函数：不 import React、不 import Electron、不做 I/O、不读全局状态。
3. 渲染进程与主进程的通信只能经**单一类型化契约模块**，禁止在 preload 里出现 `unknown` 载荷。
4. 单个组件文件超过 ~250 行，或单个组件 `useState` 超过 ~8 个，必须拆分为 feature 模块 + reducer/hook。
5. 新增样式只能进 `src/styles/tokens.css`（变量）与对应 feature 的组件样式文件；**不得再新增 theme 覆盖层**。
6. 数据结构或存储键变更，必须先写迁移与回滚方案，并保留旧版可读备份。

## 数据安全红线

- 收藏格式保持 `schemaVersion: 1`；启动时**不得**自动迁移、重写或规范化用户数据。
- 任何测试、截图、验证脚本必须使用独立临时目录，**绝不读写真实 `%APPDATA%\QIYU`**。
- 不执行未经批准的数据清除、数据库迁移、仓库公开或外部付费 API 操作。
- 保存路径必须保留：修订号检查、同目录临时文件 + 原子替换、previous 与最近 7 份 daily 备份、导入前原文。

## 交付要求

每个改动至少附带：

- 变更说明（解决了什么问题，为什么这样做）；
- `npm test`（当前基线 122 项）与 `npm run build` 的实际结果；
- 涉及界面时：`npm run test:workflow` 或对应 `scripts/verify-*.cjs` 的结果与截图路径；
- 数据风险与回退方法；
- 更新 `CHANGELOG.md`；版本号变更时同步 `README.md`。

提交规范：`feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `chore:`，一个提交只做一件事；重构提交不得夹带行为变更。