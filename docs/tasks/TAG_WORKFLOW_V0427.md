# V0427 标签选择与分配

## 身份与授权

- 状态：REVIEW，本地候选；未合 main、未推送或发布。
- 作者/集成人：Codex；非作者审查：独立只读 Agent；专项测试：独立测试 Agent。
- 依据：所有者 2026-10-26 反馈：右键不能选择已有标签、分配作品混入隐藏等操作、标签添加/移除位置不合理；另询问 Steam 商店标签的导入可行性。
- 验收：右键及详情均可勾选已有标签、输入新标签；保存前可取消；专用分配栏只整理所选标签；失败保留草稿；正常库不再提供新增隐藏操作。
- 范围：presentation 标签组件、QuickEditor、批量编辑和分配接线、对应测试及版本文档。不修改 domain、repository、IPC、同步规则、分类业务模型。

## 分支与成果

- base：main `8442ba3ea9df00df4271ab9c2bce95c0a3206e48`。
- 任务分支：`codex/tag-workflow-20261026`，独立 worktree。准确成果 SHA 见 `git log` 与随包 `SOURCE.json`；不把本文件的提交号自填为已集成 SHA。
- 测试分支：`codex/tag-workflow-tests-20261026`，只新增 `scripts/verify-tag-workflow.cjs`，审查后集入任务分支。
- 原源码脏工作区、main 集成工作区及历史发行包均不修改。

完成内容：

1. `TagPickerGroup` 同组已有标签可点选/取消，输入继续支持逗号、顿号及换行。大小写无关去重，同名跨组互不影响。当前作品独有标签也能撤销。
2. 右键与详情共用正常库同媒体词库。隐藏、回收和其他媒体的标签不混入词库。
3. 新建或已有标签的“分配作品”进入专用 `TagAssignmentBar`：集中选择管理、添加/移除方式、实际变化数量及应用按钮，不再弹第二个编辑窗口。
4. 保存按最新快照重建标签补丁；仅更新所选作品的指定组。失败保留选择和方式，取消零写入；搜索改变仍保留选择并提示当前结果外的数量。
5. 普通多选编辑复用标签选择组件。正常库右键、详情及多选撤下新增隐藏操作；历史隐藏字段、设置内查看与取消隐藏保留。
6. 版本更新为 0.4.27；仅制作本地 Windows x64 免安装候选。

主要文件：

- 新增 `features/tags/TagPickerGroup.tsx`、`TagAssignmentBar.tsx`、`tag-editor.css`。
- `RecordEditors.tsx`、`BatchEdit.tsx` 复用标签组件，继续调用原保存回调。
- `App.tsx`、`useWorkspaceController.ts` 负责词库和专用分配栏接线及模式清理。
- `ContextMenu.tsx`、`DetailPanel.tsx`、`SelectionBar.tsx` 撤下新增隐藏入口。
- `verify-tag-workflow.cjs` 新专项，`verify-library-refinement.cjs` 更新被替换的分配流程，`verify-refinement-package.cjs` 添加成品标签操作。

## 数据与回退

- schemaVersion 仍为 1，无新字段或存储键，无自动迁移或启动补写。
- 保留未知 `gameTags` 分组与其他作品字段；旧平铺标签经原逻辑归入“其他”。标签仍存在作品内，不新增独立字典；取消创建不会生成空标签。
- 回退到 base 代码即可恢复旧交互；本轮写入的数据格式相同。日常使用前仍建议在设置导出完整备份，不用旧版候选交替编辑后来新增的分类语义。
- 测试全部使用合成数据、独立浏览器或演示目录，不读取/写入真实收藏，不关闭用户实例。

## 验证与非作者审查

- Windows、Node、项目锁定依赖；`npm run desktop:build`（含 TypeScript）通过；`npm test` 212/212。
- `node scripts/verify-library-refinement.cjs`：23 组通过，24 张截图；包括浏览器真实 LocalStorageRepository 与 DesktopRepository + 内存桥、标签分配及原库/详情回归。
- 新标签专项及原生免安装验证结果在完成后追加于下方；不能用内存桥替代原生文件落盘证据。
- 非作者代码审查：未见阻断问题；特别确认 casefold/组隔离、未知扩展、dirty、最新快照、失败保留与模式退出。GUI 另以专项结果为准。
- 未运行完整历史 19 阶段工作流；本轮采用对应界面专项。不把历史测试结果计为本轮通过。
- 未验证真实个人大库或 Steam 全库存在线标签读取；没有实现新网络抓取功能。

## Steam 商店标签后续方案（研究，不是本轮功能）

结论：可实现，工作量中等；不需要 Steam 登录、API Key 或付费 AI。

- [Valve 标签说明](https://partner.steamgames.com/doc/store/tags?l=english)：商店热门标签来自开发者、玩家和管理员，通常显示最高权重的 20 个；不是本人私有标签或收藏夹。
- [GetOwnedGames](https://partner.steamgames.com/doc/webapi/IPlayerService#GetOwnedGames) 不提供这些商店标签。本次公开请求 `appdetails?appids=620&l=schinese` 有 genres/categories、无 tags，不能冒充相同信息。
- 未登录读取 [Portal 2 中文商店页](https://store.steampowered.com/app/620/Portal_2/?l=schinese) 可从 `a.app_tag` 解析 20 个标签。部分游戏实际跳年龄确认页；地区/下架/限流/页面改版可能令个别作品失败。HTML 不是稳定接口承诺。
- 建议首期：选中 Steam 游戏 → 读取热门标签 → 预览建议与分组 → 用户确认后追加。只临时保留建议，不增加持久化来源字段，不覆盖自有标签。
- “合作”不等于“刚需联机”，“困难”不等于“需要沉浸”，不自动填入主观游玩场景。先做可审核的分组建议。
- 技术边界：专用受限商店 URL、逐次跳转检查、响应体上限、超时取消、少量并发/节流与有限退避、逐件失败重试、AppID+语言会话缓存。复用现有批量追加与取消/进度机制，不借 Steam 元数据同步覆盖个人标签。
- 后续若要自动刷新、来源标记或记住忽略的标签，需要单独的数据方案确认。

## 接力

1. 检查分支 `git status/log`、本文件及随包 SOURCE，复核新专项和成品验证。
2. 所有者按 [五分钟验收](../release/验收步骤-0.4.27.md) 体验；有问题在本任务分支修复，保留原库备份。
3. 本轮没有主分支合并或 GitHub 发布授权，不自动发布、不制作安装器。
4. Steam 标签获取为后续独立任务；本轮只交可行性及边界，不把研究当已实现能力。
