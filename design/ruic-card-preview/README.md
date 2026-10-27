# RuiC 卡面试作（v0.4.30 · 独立预览）

同一张平面封面的四种呈现：原图、现有多彩、现有镭射、RuiC 分层视差。
右下方的大图是**上游查看器真实运行**的结果，不是截图，也不是本仓库重新实现的着色器。

## 打开

```powershell
node design/ruic-card-preview/serve.mjs
# http://127.0.0.1:4174/
```

`PORT` 可改端口。不需要 `npm install`：查看器以单文件 `app.bundle.js` 形式随预览分发，上游依赖已烘焙在里面，本预览**没有**在根 `package.json` 增加任何依赖。

## 目录

| 路径 | 说明 |
| --- | --- |
| `index.html` / `preview.css` / `preview.js` | 对照页；三张封面切换，RuiC 格复用同一个 WebGL 上下文 |
| `prod-material.css` | 由 `tools/extract-prod-css.mjs` 从 `src/presentation/features/library/cover-material.css` 原样抽取的多彩/镭射渐变，保证对照的是生产实现而不是仿写 |
| `cards/<slug>/` | 每张封面一份上游查看器副本：`index.html`、`app.bundle.js`、`style.css`、`card-config.json`、`assets/{background,subject,text,lineart}.png`、`assets/card.glb`、`cover.png`、`LICENSE` |
| `tools/make_layers.py` | 生成三张平面封面并把它们拆成分层素材（Pillow） |
| `tools/extract-prod-css.mjs` | 抽取生产 CSS 材质规则 |
| `screenshots/` | `compare-<slug>.png`（整页对照）与 `ruic-<slug>.png`（查看器 1280×900 全尺寸） |

## 上游与许可

- 上游：<https://github.com/HRuiCcc/RuiC-card-skill>，固定提交 `712fc9f29e6e6492b8e84791396a42003f4f0261`（2026-09-30），MIT。
- `LICENSE` 随每张卡片副本分发；本地化只改了页头字标（白相 → 栖域、WHITE ATELIER → QIYU ATELIER）和 `title`，查看器逻辑、着色器与参数未改动。
- 分层生成、构建流程使用上游 `scripts/run_pipeline.py` + Blender 4.5.15（官方包，SHA-256 校验通过），`card.blend` 与 GLB 由该流程产出；Blender 与构建中间产物留在 `.cache/ruic-build/`，**不入库**。

## 分层的真实来源与限制

四层全部由 `tools/make_layers.py` 程序化派生：

| 层 | 做法 | 深度 |
| --- | --- | --- |
| `background.png` | 平面封面本身（渐变、同心环、细边框） | −0.22 |
| `subject.png` | 以字为形的纹章，真实 alpha + 柔和外发光 | 0.30 |
| `lineart.png` | 对主体 alpha 做边缘检测，白底深线 | 跟随主体 |
| `text.png` | 标题/副题/编号独立排版层，真实 alpha | 0 |

因此：本预览证明的是**管线与查看器在真实机器上跑得通**，以及分层视差和平面材质在观感上的差别；它**不**证明上游在真人分层插画上的上限，也不代表角色立绘、特效层（`effects.png`）的最终质量。真要做角色卡，需要真正绘制/切分的主体与线稿。

现有多彩/镭射两格是生产 CSS 的静态形态，不包含应用内的悬停倾斜、指针光位与 WebGL 着色器；截图不能替代真机手感。

## 重新生成

```powershell
python design/ruic-card-preview/tools/make_layers.py --out .cache/ruic-build
python ..\ruic-card-skill\scripts\run_pipeline.py --project .cache/ruic-build\night --skip-npm
node design/ruic-card-preview/tools/extract-prod-css.mjs
node design/ruic-card-preview/serve.mjs
```

`run_pipeline.py` 首次运行会下载 Blender（约 380 MB）到 `--project` 下的 `tools/`；其后可用 `--blender <path>` 复用。

## 未做的事

- 没有把这些分层或查看器接进生产渲染器（`src/presentation/features/materials/` 未引用本目录任何文件）。
- 没有为真实收藏做批量导出/分层；三张封面都是脚本合成的，不含用户数据。
- 没有在 Electron 里验证；预览只在 Edge/Chromium 的 WebGL 路径下截图。