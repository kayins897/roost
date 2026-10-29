# v0.4.36 批量收录验证与接力

日期：2026-10-29。状态：独立分支本地候选，待所有者体验；未合 main、未推送、未发布。

## 源码与交付身份

- 基线：`c58c53f`（0.4.35）。分支：`codex/batch-intake-v0436`。
- 成品源码：`506df24e6982f4c42298a28ea6545835770fc437`，打包时 tracked 工作区干净。之后本文件及入口链接为仅文档提交，不改变成品实现。
- 主要提交：`04c56af` 图书元数据链；`8e3c3a1` 影视表格与 ISBN；`bfceb33` 预览修正／主动补空与版本；`506df24` 验证脚本。
- 免安装：`Qiyu-NoInstall-0.4.36-x64.zip`，191464032 字节。
- SHA-256：`AE570D9D4C7FB62EE95F7847D4379D7943F71E685F683C51D34DB1A7350157B7`。
- 本地交付目录：项目根下 `交付/书籍影视批量收录-v0.4.36/`，含解压目录、截图、验证记录和人工步骤。未覆盖原交付或脏的历史工作目录。

## 实测结果

| 检查 | 实际结果 | 证据入口（本工作树，已忽略） |
| --- | --- | --- |
| `npm test` | 294/294 | `.tmp-unit-intake.log` |
| `npm run pack`（含 TS、Vite、桌面构建） | 通过，仅目录打包，无安装版 | 构建记录 |
| `verify-batch-intake.cjs` | 源码 11/11；交付 ZIP 解压后的 EXE 11/11 | `evidence/batch-intake-v0436/{source,packaged}/validation.json` |
| `verify-import-preview.cjs` | 4/4，浏览器及 DesktopRepository 内存桥 | `evidence/import-preview-v0436/validation.json` |
| `verify-steam-batch.cjs` | 9/9 | `evidence/steam-batch-v0436/validation.json` |
| `verify-books-controls-import.cjs` | 10/10 | `evidence/books-controls-v0436/source/validation.json` |
| `verify-screens.cjs` | 21/21 | `evidence/screens-v0434/source/validation.json`（脚本历史目录名；报告内版本 0.4.36） |
| `verify-interface-preferences.cjs` | 18/18 | `evidence/interface-v0435/source/validation.json`（同上） |
| `verify-package-assets.cjs` | 15 ASAR 资源＋5 随包文件一致，SOURCE 干净提交及版本核对通过 | `evidence/package-assets-v0436.json` |

源码界面共73项、交付EXE专项11项；没有把这些当作完整工作流全量通过。未重新运行全工作流、未逐项在EXE中重跑书籍／影视／字体所有回归。新增流程的来源响应由测试进程合成，经真实 IPC 进入；未实测本轮真实豆瓣网络连通或真实账号资料。全部使用合成数据和隔离临时目录，没有访问真实收藏。

旧的预览／Steam 专项最初因仍找旧顶栏入口而超时；已改为当前 Dock 收录中心，再同步既有分类、音乐撤下及提示文案断言。最终全项重跑通过，未为迎合断言修改产品语义。

## 审查与修复

非作者只读审查发现“子页面先被规范为作品页、绕过读取资格检查”的 P2。已收紧导入解析三处豆瓣路径匹配，增加 CSV/JSON → intakeSubject 的两板块链路断言；子页面保留原链接但不生成身份或触发读取，非法 externalIds.url 拒绝。复核21项定向测试通过，无新增 P1/P2。窄窗纠错使用弹窗整体滚动，保留正常长清单内部滚动。

## 数据与回退

无新持久化字段、存储键或 schema 变化。ISBN 仅增加临时身份，不改书号原文；启动不迁移。最终追加沿用最新快照再次去重、修订检查与备份；个人评分、零值、原标签、记录和未知扩展保持。

启用前在旧版导出完整备份并退出旧程序；先用随包「启动演示.cmd」试用。回退保留升级前备份和新版完整导出，旧程序打开备份副本，不交替编辑同一库。

## 接力操作

1. 核对分支和 Git 状态，阅读 [实现边界](BATCH_INTAKE_V0436.md) 与 [人工验收](../release/验收步骤-0.4.36.md)。勿清理原工作目录的历史未提交改动。
2. 所有者试用模板 → 预览纠错 → 主动补空 → 最终追加，确认是否满足个人书单／片单实际整理流程。来源访问失败可继续离线流程，不绕过来源限制。
3. 后续需求可单独推进日历与跨媒体回顾；不要重复开发已完成书籍／影视功能。账号导出适配、书名自动匹配及日历共享模型仍需独立范围和验收，不在此候选隐含实施。
4. 未获得主分支集成／发布授权；如后续授权，先审查从基线起的四个实现／测试提交与本轮文档，按现有工作流集成。包内 SOURCE 固定于上述源码提交。
