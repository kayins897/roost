# v0.4.30 卡面精简与评分分段 · 接手记录

## 0. 本轮结论

- 卡面材质收敛为两档（镭射、多彩），评分分组改为十个固定区间，两项都已落地并通过源码验证。
- 新增独立预览 `design/ruic-card-preview/`，用上游 RuiC-card-skill 的查看器真实渲染程序化分层素材；它不进入生产构建，也不改应用渲染路径。
- 没有新增字段、存储键、依赖或迁移，`schemaVersion` 仍为 1。

## 1. 基线与分支

| 项 | 值 |
| --- | --- |
| 接手工作树 | `codex-refine-score-materials-v0429`（独立工作树名） |
| 接手分支 / 提交 | `codex/refine-score-materials-v0429` / `b6a9be1`（v0.4.29） |
| 本轮分支 | `deepseek/card-bands-v0430` |
| 本轮工作树 | `deepseek-card-bands-v0430`（独立工作树名） |
| 版本 | 0.4.29 → **0.4.30** |
| 未触碰 | 原开发工作树（有未提交修改）、GitHub `main`、其它 25 个工作树 |

## 2. 卡面材质精简

`src/domain/gameRating.ts`

- `CoverFinish` 由六值收窄为 `'standard' | 'holographic' | 'prismatic'`。
- `GAME_GRADE_TIERS`：SSS 多彩、SS 镭射、S/A/B/C 标准。
- `scoreFinishFor`：`>= 9.5` 多彩、`>= 9` 镭射、其余标准；删掉 `>= 8 -> foil` 分支，因此 8.0–8.9 与 0 分都回到原图，数值 0 不会回落到字母特效。

同步清理：`holoShaders.ts` 移除 foil 着色器与条目、`holoRenderer.ts` 的 `Kind`/`names` 只剩 holo/poly、`useHoloCovers.ts` 白名单收窄、`cover-material.css` 删除 foil/silver/gold 规则、`rating.css` 只留镭射与多彩颜色、`tokens.css` 删除 `--foil-silver`/`--foil-gold`、设置页文案改为「9.0–9.4 镭射 · 9.5–10 多彩 · 其余使用原始封面」。

兼容：0.4.29 及更早写入的字母评级 `personalGrade` 原值保留，不改写、不换算；SSS/SS 的历史含义经 `GAME_GRADE_TIERS` 继续映射到多彩/镭射。

## 3. 评分区间分组

`src/domain/gamePlanning.ts`

- 新增 `SCORE_BAND_TOP = 9`、`scoreBand()`、`scoreBandId()`、`scoreBandLabel()`、`scoreOf()`；`rankId()` 在评分模式下返回 `score-<band>`，与段内移动共用同一判定。
- `groupRankedGames()` 在评分模式生成十个固定区间（降序 9→0，升序 0→9），再接历史字母组与未排序组；空区间由列表组件过滤。
- `sortRank()` 在没有显式顺序时按真实评分降序，保留 8.9 与 8.2 的差别。
- `moveGameWithinRank()` 未改动：它本来就从全量 `allItems` 取同段成员，因此筛选视图里拖动不会重编号未显示的同段作品。

行为边界：区间只影响分组，不参与评级门槛；未评分与 0 分不同（前者在历史字母区，后者在 0–0.9 段）；改分清空该作品的 `ratingOrder`；首次拖动会把整段写成 0..n-1 的显式顺序。

## 4. 独立预览 `design/ruic-card-preview/`

- 上游：`https://github.com/HRuiCcc/RuiC-card-skill`，固定提交 `712fc9f29e6e6492b8e84791396a42003f4f0261`，MIT，`LICENSE` 与来源说明随预览保存。
- 流程：`tools/make_layers.py` 用 Pillow 从平面封面派生背景 / 主体 / 线稿 / 文字四层（主体与文字为真 alpha）→ 上游 `run_pipeline.py` 下载官方 Blender、生成 `card.blend` 并导出 `web/assets/card.glb` → 查看器加载 GLB 渲染。
- 视图：`index.html` 每张封面并排给出原图、现有多彩、现有镭射三格静态对照，下方同一素材的 RuiC 三维查看器（1280×900）；整页只保留一个 WebGL 上下文。
- 打开方式：`node design/ruic-card-preview/serve.mjs` → http://127.0.0.1:4174/
- 限制：分层是程序化派生，不代表上游在真实分层素材上的上限；查看器沿用上游默认观感，没有接入应用内的悬停倾斜与指针光照。

## 5. 验证

| 项目 | 结果 |
| --- | --- |
| `npm test` | 219 通过 / 0 失败（域级用例新增区间分组断言） |
| `npm run desktop:build` | 通过 |
| `node scripts/verify-bento-materials.cjs` | 源码级全通过，退出码 0 |
| `node scripts/verify-score-bands.cjs` | 11 项全通过，退出码 0 |
| 预览 Playwright 检查 | 三张封面均为 `webgl` 就绪，无 4xx 资源 |
| 免安装包 | 见 `交付/卡面精简与评分分段-v0.4.30/` 与发布报告 |

`verify-score-bands.cjs` 覆盖：只渲染有作品的四段且顺序正确、不再出现小数分组、段内按真实分降序、0 分与未评分分属不同段、段内下移立即落盘并写 0..n-1、其它区间不重编号、重载后顺序保持、切换方向只改区间顺序、改分清空顺序并归入新区间。

## 6. 已知限制与未做

- 旧脚本 `scripts/verify-cover-finishes.cjs`、`scripts/verify-cover-grades.cjs` 仍按 0.4.24 的材质映射断言，本轮未修（已被上面的脚本取代）。
- 区间标签用「9–10 分」形式，与 8.9 这类一位小数一致；若后续想显示「9.0–10.0」需要同时改标签函数与测试。
- 预览没有打包进发行包，也不改变应用运行路径。
- 未在真实收藏上验证（全部使用隔离临时目录与合成数据）。

## 7. 回退

删除 `deepseek/card-bands-v0430` 分支即可回到 `b6a9be1`；本轮无数据写入变化，回退不需要迁移或恢复备份。若只需关掉区间分组，可将 `rankId()` 的评分分支改回 `score-${score.toFixed(1)}`，但段内移动的同一判定也要一起改。

## 8. 下一步（交给 Codex）

1. 复核 `src/domain/gamePlanning.ts` 的区间边界与 `moveGameWithinRank` 的全量取组假设。
2. 决定区间文案是否要写成 9.0–10.0。
3. 若接受预览方向，再把分层规范推广到真实封面素材（需要真正的分层源文件，不能只靠程序化派生）。