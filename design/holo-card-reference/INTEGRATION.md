# 接入栖域封面材质：可行性说明（未接入）

本目录只是效果基准，没有改动应用行为。`src/` 里的 SS 封面仍然是
`src/presentation/features/library/cover-material.css` 的纯 CSS 线性渐变。

## 先看清冲突

`CHANGELOG.md`（0.4.23）已经写死一条决定：

> SS 封面使用冷色银蓝镭射，SSS 恢复更明显的多彩光谱；保留对角光线，去除网点与网格。

本效果恰好是「网格」，两者不能并存。要接入就得先决定：改这条决定，还是把它作为新增材质
（例如只给 SSS，或新开一档），而不是直接替换 SS。

## 三种接入方式

### A. 只在放大／详情页渲染（推荐先做）

列表卡片保持 CSS 材质不动，hover 放大到 160px 以上或进详情页时才挂 canvas 跑 shader。
成本可控、视觉冲击最大，也不影响列表滚动。

### B. 列表内共享一个 WebGL 上下文

一张 canvas 只画当前 hover 的那张卡，绝对定位跟随 `.card-cover`。封面本身是本地
data URL（`src/domain/catalog.ts:98` 已保证），可直接当纹理，不会污染 canvas。

### C. 每张卡一个 canvas（不推荐）

240x360 的 canvas 在 60Hz 下就是一次全屏 fragment 计算；一屏 30 张卡 = 30 次 draw call
加 30 个 GL 上下文（浏览器一般只给 16 个）。

## 必须一起带上的降级

- `prefers-reduced-motion: reduce`：不跑 rAF，只画一帧静止色相
- `hover: none`（触摸）：不挂 canvas
- `document.hidden` / blur / 滚动：暂停 rAF
- WebGL 不可用或丢上下文：退回现有 `.cover-foil--holographic`

## 改动清单（真要接的时候）

1. `src/presentation/features/library/HoloCoverCanvas.tsx`（超过 250 行要拆，见 `AGENTS.md`）
2. 样式只进 `cover-material.css`，不新增主题覆盖层
3. 仿 `scripts/verify-cover-finishes.cjs` 加脚本，断言 canvas 存在且首帧非纯色
4. `npm test`（基线 167 项）+ `npm run build` 全绿，更新 `CHANGELOG.md`

## 三联页与栖域材质怎么对（补充）

`index.html` 现在一页跑四个效果，接入时按「能不能违反 0.4.23 那条『无网格、网点』结论」来分：

| 参考效果 | 含网格？ | 建议 |
| --- | --- | --- |
| Shader 2 · 多彩 | 否 | 与既有决定不冲突，最适合作 SS「镭射全息」的升级；注意必须用低强度（demo 里 0.32），满强度会把卡面洗成彩虹噪点 |
| Shader 1 · 闪箔 | 否（同心圆 + 放射扇形） | 金属箔反光，适合作第三种材质，和「镭射」区分度够 |
| Shader 4 · 镭射 | 是 | 与 0.4.23 的决定正冲突，必须产品拍板后再接 |

三个都共用 `holo.js` 里的 `VERT` / `COMMON` / `FIELD`，接入时把对应的 `BODY_*` 搬进 `HoloCoverCanvas.tsx` 即可；`uField`、`deltaK` 这两个「复刻补齐参数」在 `SOURCE-README.md` 里有说明，接进产品时应固化成常量而不是暴露给用户。
