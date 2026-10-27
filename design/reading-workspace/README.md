# 书籍与全局日历交互预览

独立设计预览，基于应用 0.4.30；不是新的应用版本。书目、封面、感想、时长和计划全部是示例；演示今天固定为 2026-10-27。仅使用内存，刷新即恢复，不读写收藏、浏览器存储或账号。

## 体验入口

已有项目依赖时，在仓库根目录运行：

```powershell
node design/reading-workspace/build.cjs
node evidence/reading-workspace-preview/serve.cjs 4186
```

浏览器打开 `http://127.0.0.1:4186/`。也可以直接打开生成目录的 `index.html`，不需要服务器或网络；字体随预览复制，许可证保留。

生成到自定义目录：`node design/reading-workspace/build.cjs <输出绝对目录>`。不修改生产入口、依赖、版本或 Electron 包。

## 可以实际操作的内容

- 日历首页：年度/月度/每周、前后范围、回到今天、媒体和文字筛选、日期详情、跨媒体体验及未来计划；按范围分别汇总作品数和已知时长。
- 年度：点击日期看当天，点击月份展开月历；周历以周一开始，可以回顾上一周或安排下一周。
- 书籍：阅读计划/阅读记录一次一面，在读置顶，待读可上移/下移；搜索时暂停排序。
- 阅读详情：独立资料与个人感想，补录未知/月/日完成日期；一句话和长文分开，同书多次阅读保留各次感想。
- 重读：已读书籍可加入新计划，修改旧感想不取消新计划；只有明确“完成本次阅读”才结束当前计划。
- 阅读热力表：实际日级分钟累加，同书多次及不同书籍均可；未知与 0 不混淆，计划不计时，读完事实不额外计时。
- 登记、修改、删除阅读分钟会同步影响日历和热力表；部分表单提供明确标注的模拟保存失败开关，失败后草稿保留。
- 取消计划/删除活动不删书目与历史。无日期记录留在独立清单，不伪造收录日为体验日。

## 建议验收顺序

1. 在日历切“每周”，点上一周：影视为 102 分钟，游戏通关事实有记录但时长未知，书籍明确 0 分钟。
2. 回今天：本周书籍已知 70 分钟；再点下一周，安排一个作品到该周。计划不增加实际时长。
3. 切年度查看十二个月，点击某月、某日；游戏九月的月精度记录留在清单，不落到九月一日。
4. 打开书籍：两本在读置顶；《悉达多》在待读，同时能在“阅读记录”看旧感想。
5. 登记今天阅读 30 分钟：热力表从 50 变 80，日历同步；修改或删除这条记录会同步校正。
6. 打开《悉达多》，编辑旧感想，再补一轮阅读记录：历史、新轮次及重读计划都保留。
7. 在表单中模拟失败、取消、重试；检查未知日期、空分钟与明确 0。刷新恢复合成初始状态。

## 验证

```powershell
node node_modules/typescript/bin/tsc -p design/reading-workspace/tsconfig.json
node --test --experimental-strip-types design/reading-workspace/model.test.ts design/reading-workspace/periods.test.ts
node design/reading-workspace/build.cjs
node design/reading-workspace/verify-preview.cjs
```

浏览器脚本使用现有 Playwright 和本机 Edge，在隔离上下文中操作；默认预览服务器 4186，输出 `evidence/reading-workspace-preview/verification.json` 及实际截图。`READING_PREVIEW_URL` / `READING_PREVIEW_OUTPUT` 可指定验收入口/输出。源码和 `file://` 入口都检查；不启动生产应用。

## 边界与接力

- 预览 reducer 是合成交互模型，不能直接当作正式存储格式复制。正式数据/兼容关系见[待审提案](../../docs/proposals/BOOK_CALENDAR_DATA.md)。
- 本轮不接个人微信读书/豆瓣账号，不读汉王设备；来源能力、限制和未实测项见[来源核查](../../docs/research/BOOK_SOURCES.md)。
- 正式首页、书籍模型、跨来源消歧、幂等导入、完整备份/重启持久化仍需后续实施，不由本原型验收自动通过。
- 状态、被测范围、独立审查及后续任务见[任务交接](../../docs/tasks/READING_WORKSPACE_PREVIEW.md)。
