# Mineradio 复刻参考实现（流体板 / 六带星河 / 液态玻璃）

对 Mineradio 主题（github.com/dhicoc/dsh-theme-mineradio）签名视觉的完整逆向复刻，
MIT 协议下逐参数移植。本目录是**参考实现基准**：`index.html` 双击即可运行，
零依赖、离线可用，是效果与参数的单一事实来源。

## 运行

双击 `index.html`。推荐 Chromium / Edge（液态玻璃完整生效）；
Firefox / Safari 不支持 backdrop SVG 滤镜，液态玻璃自动降级为磨砂。

交互：移动指针（视差 + 玻璃追光 + 流体笔刷）、点击空白（星尘涟漪）、
拖住不放（粒子被强拉）。设置分「基础排 + 两个折叠高级区」。

## 效果构成

### 流体板（远层）
两遍渲染的流场模拟：1/4 分辨率 flow map（影响强度 r + 流向 gb）在两个
framebuffer 间 ping-pong，每帧按 0.96 衰减、指针注入高斯笔刷；全分辨率侧
用 value noise 域扭曲 + 8 次 swirl 迭代 + 三色 soft blend 渲染。30fps 节流，
DPR 封顶 1.5。

### 六带星河（近层）
Canvas 2D，最多 900 颗粒子按 6 条横向星带分布：带内流速随带索引递增，
正弦波道上下起伏，高斯"山脊"控制带内明暗，sin³ 闪烁，4 种预烘焙径向精灵
（主色亮斑 / 次级浅色 / 深色 / 近白）做加法混合。指针 130px 内增亮、
190px 内被指针速度拖拽；点击落下扩散涟漪（260px/s，2s 生命周期，同时最多 8 个）。

### 液态玻璃
nico-glass-kit 配方：圆角矩形 SDF（有向距离场）编码边缘内法线到 R/G 通道
生成透镜置换图（0.2x 光栅化，feImage 拉伸），feDisplacementMap 让背景在
边缘真实折射；三次不同强度位移 + RGB 通道分离 + screen 混合实现色散；
mask-xor 环形高光（1px 环 160° 渐变 + 2px 环指针追光）；阻尼弹簧
（stiffness 180 / damping 20）让玻璃朝指针弹性倾斜、折射同步加深。

### 中性玻璃按钮
Dock 按钮去掉彩色填充：半透明白 + 独立 backdrop-filter + 内圈 rim，
每颗按钮带指针追光（--glass-bx / --glass-by），激活态用亮度与 rim 区分。

## 参数速查

| 控件 | 映射 |
| --- | --- |
| 视差幅度 | 远层 20/13px·0.8° / 近层 40/26px·1.5° 的整体倍率 |
| 粒子密度 | count = area / 3400 × (density / 50)，上限 1400 |
| 流体色调 | 复刻版色板：香槟金 / 深海蓝 / 极光绿 / 紫罗兰 / 绛红（任意色相，结合色深滑杆）；应用版为四段光谱锚点色板 |
| 流体色深 | 调色板明度位移：0.22 为基准，0 深邃、100 淡雅 |
| 流体流速 | uniform u_time 倍率 speed / 100 |
| 流体涡旋 | u_swirl = swirl / 50 |
| 扭曲 | u_distortion = distort / 100 |
| 笔刷力度 | flow pass u_brushStrength（0 = 关闭搅动） |
| 笔刷半径 | u_brushRadius（同时决定涟漪与玻璃透镜基准） |
| 玻璃模糊 | feGaussianBlur sigma = blur / 2 |
| 玻璃折射 | feDisplacementMap scale = refraction × 24 × (255 / 127) |
| 玻璃色散 | 三次位移的 RGB 分离幅度 = refraction × 色散 × 0.2 |
| 透镜深度 | SDF 渐变带宽度（px） |
| 玻璃弹性 | 弹簧目标位移 nx × 弹性 × 24，折射同步 ×(1 + e×0.5×(1-d×0.6)) |

## 与 qiyu-desktop 0.4.19 的映射

| 复刻版 | 应用版 | 说明 |
| --- | --- | --- |
| 流体板引擎 | `src/presentation/fluidBoard.ts` | 完整移植，由 AmbientScene 门控运行 |
| 六带星河 | `src/presentation/AmbientScene.tsx` | 粒子系统替换为复刻版，保留应用的可见性 / 减少动态门控 |
| 液态玻璃 | `src/presentation/glassKit.ts` | 无 ngs-motion 包装层：弹簧与位移直接作用于 Dock / 搜索元素 |
| 玻璃 rim 高光 | `src/presentation/cinema.css` 末尾 | inset shadow calc 读 --spec-x / --spec-y |
| 流体层样式 | `src/presentation/ambient.css` | `.ambient-scene__fluid`，流体开启时隐藏旧流光带 |
| 中性玻璃按钮 | `src/presentation/cinema.css` 末尾 | Dock 按钮去彩色填充 + 按钮级追光 |
| 设置面板 | `src/presentation/App.tsx` 设置弹窗 | 色板按钮 + 折叠分组改为弹窗分区 |

### 应用版与复刻版已知差异（后续对齐清单）

- 应用版无逐按钮位移滤镜（按钮用 backdrop blur + 追光，位移只在 Dock / 搜索整体上）。
- 应用版色散固定为折射 × 0.12，未单独暴露滑杆。
- 应用版涟漪的门控更严格：只排除交互元素与卡片，其余空白均可触发。
- 复刻版的「Logo 回响」遮罩（手柄形状涡旋）与粒子手柄 Logo 未进入应用版（已按需求移除）。
- 复刻版设置为基础排 + 折叠高级区；应用版是设置弹窗内的分区。

## 维护提示

- 应用版集成源码副本在本目录 `reference/`（以 qiyu-desktop 仓库内文件为准）。
- 重新打包应用：`npm run pack`，产物在 `release/win-unpacked`，需手动同步到
  `release/<版本>/win-unpacked`。
- 演示交互源（会话内可视化）保留在 ZCode 会话可视化目录
  `mineradio-fluid-parallax.html`，与 index.html 同源。
