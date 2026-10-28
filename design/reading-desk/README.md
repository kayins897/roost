# 书籍书架 · 独立交互预览

本轮根据所有者最新反馈改为游戏库式封面布局，不再使用大幅在读展示。仅合成书目、原创 SVG 封面、示例感想和分钟记录；修改只保留在本次页面内，刷新恢复。**不是应用更新，也不访问正式收藏。**

## 打开

```powershell
node design/reading-desk/build.cjs
node evidence/reading-desk-preview/serve.cjs 4190
```

访问 `http://127.0.0.1:4190/`。也可双击输出目录 `index.html`，字体与许可证均在本地，不依赖网络。构建可接受一个自定义输出目录参数。

## 本轮交互

- 想读／读过一次只显示一面。在读使用同尺寸普通书卡并置顶，紧邻主筛选有在读按钮；不再单独占据大卡片区域。
- 两面独立保留网格／列表选择。计划顺序／阅读时间、名称、年份可排序；计划中的在读书始终靠前。
- 阅读记录最上方是放大的年度热力表，按实际分钟着色。窄屏可横向浏览全年，回到年初；日期支持方向键及回车。标签、搜索不改变热力表统计范围。
- 标签栏支持多选交集筛选。加号进入新增／管理，已有标签可以分配给书籍、从书籍移除或确认删除；右键书籍或详情中的编辑标签可直接勾选已有标签、新建标签。普通分配需应用，取消不写入；新建空标签独立保留，删除标签不删书。
- 标签计数按当前视图和搜索中的不同书目计算，不受已选标签再次缩窄。默认显示部分标签及更多，已选标签始终可见。
- 主题书单保留 Dock 入口，仍是固定示例；本轮不开发书单管理或电子书阅读器。没有开始阅读或替代按钮。
- 点书看历次感想，可补录计划、读完记录及日级分钟。重复阅读的计划和过去记录独立，普通分钟日志不算读完。

## 验证

```powershell
node node_modules/typescript/bin/tsc -p design/reading-desk/tsconfig.json
node design/reading-desk/build.cjs
node design/reading-desk/verify-preview.cjs
node --test --experimental-strip-types design/reading-desk/book-tags.test.ts design/reading-workspace/*.test.ts
```

隔离 Edge 14 组界面检查和 5 种尺寸截图、29 项原型单测已通过。应用 219 项单测及构建通过，保留既有大包提示。可用 `READING_DESK_URL`／`READING_DESK_OUTPUT` 改测试入口及证据目录。

本轮分支 `codex/books-library-layout-v0430`，正式包仍为 0.4.30，没有生产代码、数据字段、存储键、迁移、依赖或 EXE 交付变化。完整接力见 [READING_DESK_PREVIEW](../../docs/tasks/READING_DESK_PREVIEW.md)。
