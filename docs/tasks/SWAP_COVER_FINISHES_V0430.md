# v0.4.30 后续源码补丁：评分材质互换

所有者 2026-10-27 要求把镭射和多彩对应关系换过来，并询问全息实验入口。基于已审查代码 `a7404ec`（审查文档提交 `aaa109a`），在独立分支 `codex/swap-cover-finishes-v0430` 实施。

## 当前显示规则

- 9.5–10：镭射（`holographic`）。
- 9.0–9.4：多彩（`prismatic`）。
- 低于 9 分：原图。
- 没有数值评分的历史 SSS/SS：分别显示镭射/多彩；其余历史字母显示原图。
- 既有评分资格、数值优先于历史字母的规则、评分分段、优先级、渲染公式保持不变。

这是显示映射调整，无新增字段、存储键、数据迁移或启动写库。设置文案及现行域/详情回归断言同步。原 DeepSeek 分支、交付 ZIP 和独立实验不作改写。**尚未重新打包；已有 0.4.30 ZIP 不含此补丁。**

## 全息实验入口

RuiC 新实验位于 DeepSeek 工作树 `design/ruic-card-preview/`。已有本地服务 `http://127.0.0.1:4174/` 经检查返回 200，可直接在浏览器打开。

服务结束后，在该工作树运行 `node design/ruic-card-preview/serve.mjs` 后打开相同地址。页面依赖本地服务读取查看器资源，直接双击 HTML 不能代替完整预览。

原 `design/holo-card-reference/` 是更早的镭射/多彩着色器实验；RuiC 是另一套独立查看器。其当前分层演示、静态对照及交付缺口见 `CODEX_REVIEW_CARD_BANDS_V0430.md`，本次没有扩展该实验。

## 本次验证

- `npm test`：219 项通过，0 失败。
- `npm run desktop:build`：通过，含类型检查。
- `node scripts/verify-bento-materials.cjs`：源码 Electron 34 项通过，含新映射、自动保存、相册和完整备份回归，0 页面错误；使用隔离合成数据。
- 非作者只读简审通过：确认只交换材质选择，没有改材质身份、渲染器或存储。
- 记录：`evidence/codex-review-v0430/swap-{unit,build,bento}.log`。本次没有重新打包，也没有将旧 ZIP 的验证当作补丁成品验证。
