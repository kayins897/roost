# 栖域架构说明

> 架构约束沿用；2026-10-25 已校对事实入口。第 2 节是 2026-10-23 历史采样，不表示当前欠账全部未做。当前实现与证据见 [能力基线](product/CAPABILITY_BASELINE.md)，协作归属见 [ADR-011](DECISIONS.md) 和 [AGENTS](../AGENTS.md)。

## 1. 分层与依赖方向

```
presentation (React)  ──▶ domain (纯规则)
        │                    ▲
        ▼                    │
infrastructure ──────────────┘      desktop (Electron 主进程)
```

| 层 | 目录 | 允许依赖 | 禁止 |
| --- | --- | --- | --- |
| 领域 | `src/domain/` | 仅 TS 标准库、同层模块 | React、Electron、DOM、I/O、`window` |
| 基础设施 | `src/infrastructure/` | `domain`、`window.qiyuDesktop` 契约 | React 组件、业务规则 |
| 表现 | `src/presentation/` | `domain`、`infrastructure` 的工厂/契约 | 直接 `fs`、`ipcRenderer`、硬编码路径 |
| 桌面 | `desktop/` | `domain`、`shared` 契约、Electron | 引入 React 或表现层代码 |

规则落地方式：`domain` 里出现 `import ... from 'react'` 或 `electron` 即为违规；`presentation` 里出现 `ipcRenderer` 即为违规。

## 2. 现状量化（2026-10-23 基线）

| 项 | 数值 | 判断 |
| --- | --- | --- |
| `src/domain/*.ts` 非测试代码 | 约 1.4k 行，均有对应测试 | 健康 |
| `npm test` | 122 项通过 | 健康 |
| `desktop/store.ts` | 4.8KB，职责单一 | 健康 |
| `src/presentation/App.tsx` | 562 行 / 65KB，9 个组件同文件，**单个 App 组件 36 个 `useState`** | **主要技术债** |
| 样式 | `styles.css` 38.8KB + `theme.css` 49.6KB + `cinema.css` 12KB + features 等，打包后 114KB | **第二技术债：多层覆盖** |
| IPC 契约 | `desktop/preload.ts` 用 `unknown` 转发；契约类型写在 `infrastructure/repository.ts` 内 | 需收紧 |

历史结论：保留领域与存储分层，避免无关重写。当前已有共享类型化 IPC、feature/controller 提取及 token 文件；显式业务 action reducer 与多层样式覆盖收敛仍未全部完成。不得根据本表旧数字重复立项。增量业务规则按已批准任务修改，不能把“保持分层”误读为禁止领域功能开发。

## 3. 目标目录结构（渐进迁移，不要求一次到位）

```
src/
  domain/                 # 纯规则（保持现状）
  infrastructure/         # 仓储实现（保持现状）
  shared/                 # 新增：跨进程契约与共享类型
    ipc-contract.ts       #   唯一的 IPC 方法签名与载荷类型
  presentation/
    app/
      App.tsx             #   只做组合与路由，目标 < 150 行
      useLibrary.ts       #   收藏库状态机（reducer + 派生查询）
      useFilters.ts       #   筛选/排序/视图状态
    components/           #   无业务语义的通用件：Modal、Poster、Button…
    features/
      library/            #   作品网格、卡片、列表
      detail/             #   详情抽屉、快捷编辑
      editor/             #   新增/编辑表单
      tags/               #   标签管理与筛选面板
      experience/         #   体验记录与回顾
      metadata/           #   资料检索与导入
      steam/              #   Steam 连接、批量导入、同步
      batch/              #   批量编辑
      ambient/            #   背景与外观偏好
  styles/
    tokens.css            #   唯一的变量来源（颜色、间距、字号、动效）
    base.css              #   reset、排版、滚动条
```

## 4. 状态管理规则

- `App` 不再持有几十个 `useState`。收藏库读写集中到 `useLibrary`：`useReducer` + 显式 action（`load`/`create`/`patch`/`remove`/`import`/`restore`），保存失败回滚到上一快照。
- 筛选、排序、视图模式这类**派生 UI 状态**放 `useFilters`，不写进收藏库。
- 派生数据用 `useMemo` 计算，不额外存 state（避免双份真相）。
- 任何写库动作必须经过 `repository.save()`，不得绕过；UI 层不得自己拼 `LibrarySnapshot` 的持久化细节。

## 5. 样式规则

- 变量只允许在 `src/styles/tokens.css` 定义。禁止在组件文件里新增 `:root` 变量。
- 一个 feature 一个样式文件，与组件同目录，类名以 feature 前缀（`detail-`、`editor-`）。
- 禁止新增整站级 theme 覆盖层。历史上的 `styles.css`/`theme.css`/`cinema.css` 在重构中合并，合并完成后删除旧文件。
- 动效必须响应 `prefers-reduced-motion`。

## 6. IPC 契约规则

- 所有渲染进程 ↔ 主进程调用集中在 `src/shared/ipc-contract.ts`：方法名、请求载荷、响应载荷、错误结构各一处定义。
- `preload.ts` 只做校验与转发，参数类型必须来自契约，不允许 `unknown`。
- 主进程 `ipcMain.handle` 的返回类型由契约约束，避免三处各写一份接口。

## 7. 重构纪律

1. **行为不变**：重构提交不新增功能、不改文案、不改视觉；测试结果必须与该任务的已测基线一致，实际数量以最新能力基线为准，不沿用历史 122 项。
2. **小步提交**：一次只搬一个 feature，提交后可单独回退。
3. **先测后搬**：被搬动的逻辑若没有测试，先补测试再搬。
4. **不重写领域层**：`src/domain` 只做增量修改，不做「顺手重构」。

## 8. 新增功能的落位

| 要加的东西 | 放哪 |
| --- | --- |
| 新的收藏规则/校验 | `src/domain/`，附单元测试 |
| 新的数据来源（平台解析） | `desktop/` 抓取 + `src/domain/` 纯解析，两者分开 |
| 新页面或面板 | `src/presentation/features/<name>/` |
| 新样式变量 | `src/styles/tokens.css` |
| 新 IPC 方法 | `src/shared/ipc-contract.ts` + `preload.ts` + `desktop/main.ts` |
