# 小丑牌特殊卡效果 · 源出处与转录

四个效果都出自 B 站 UP 主「左右横条的酸葡萄」的《小丑牌特殊卡效果 Shader》系列。简介里的网盘（`pan.baidu.com/s/1oTW7fqo4TdbdHt54bYlHHA` 提取码 1286）是 Balatro 的 shader 换肤文件，**已失效**；本目录按视频画面逐帧放大转录，不含原作者的 shader 与任何游戏素材。卡片封面是页内 `makeCover()` 合成的原创图。

| 效果（命名沿用游戏内版本） | 视频 | aid / cid | 时长 |
| --- | --- | --- | --- |
| Shader 4 · 镭射（Holographic） | `BV1ep421S7Hv` | 1853718739 / 1519596594 | 13.6s |
| Shader 1 · 闪箔（Foil） | `BV1Tr42137Lz` | — / 1518272608 | 24s |
| Shader 2 · 多彩（Polychrome） | `BV1CH4y1A7aW` | — / 1519260598 | 17s |
| Shader 3 · 反转（已从 demo 移除） | `BV1eC411H7Xk` | — / 1519471596 | 18s |

取证方式：分镜图接口 `x/player/videoshot` 返回的图基本全黑，不可用；改用 `x/player/playurl?qn=80&fnval=1&platform=html5&high_quality=1` 带 `Referer: https://www.bilibili.com/` 拿到 1280x720 mp4，再用 `imageio-ffmpeg` 抽 2fps 逐帧，代码面板按 2 倍放大转录。720p 下代码面板约 8px 字高，但放大后逐字可读。

---

## Shader 4 · 镭射 Holographic（BV1ep421S7Hv）

第一段（约 3.7s，干涉场与色相驱动）：

```glsl
half2 field_part1 = uv_scaled_centered + 50.*half2(sin(-t / 143.6340), cos(-t / 99.4324));
half2 field_part2 = uv_scaled_centered + 50.*half2(cos( t / 53.1532), cos( t / 61.4532));
half2 field_part3 = uv_scaled_centered + 50.*half2(sin(-t / 87.53218), sin(-t / 49.0000));

float field = (1.+ (
            cos(length(field_part1) / 19.483)
            + sin(length(field_part2) / 33.155) * cos(field_part2.y / 15.73)
            +cos(length(field_part3) / 27.193) * sin(field_part3.x / 21.92) )
        )/2.;
float res = (.5 + .5* cos( (rayOffset.x) * 2.612 + ( field -0.5 ) *3.14));
```

第二段（约 5.7s，注释「网格图形」）：

```glsl
//------------网格图形
half fac = 0.5*max(max(max(0., 7.*abs(cos(uv.x*gridSize*20.))-6.),
                    max(0., 7.*cos(uv.y*gridSize*45. + uv.x*gridSize*20.)-6.)),
                    max(0., 7.*cos(uv.y*gridSize*45. - uv.x*gridSize*20.)-6.));
```

第三段（约 7.7s，HSL 改写）：

```glsl
hsl.x = hsl.x + res * fac;
hsl.y = hsl.y*1.3;
hsl.z = hsl.z*0.6+0.4;
return RGB(hsl);
```

第四段（约 10s，注释「最终颜色」）：

```glsl
//最终颜色
tex = (1-delta)*tex + delta*RGB(hsl)*color;
```

---

## Shader 1 · 闪箔 Foil（BV1Tr42137Lz）

视频用 Shader Graph 节点图 + 代码面板两种方式讲解，下面四段是代码面板原样。

同心圆波（视频里那张黑白圆环就是它）：

```glsl
half fac = max(min(
    2*sin((length(90*adjusted_uv) + _holo.r*2) + 3*(1.+0.8*cos(length(113.1121*adjusted_uv) - _holo.r*3.121)))
    - 1
    - max((5.-length(90*adjusted_uv)), 0), 1), 0);
```

方向余弦（放射高光的角度来源）：

```glsl
half2 rotater = half2(cos(_holo.r*0.1221), sin(_holo.r*0.3512));
half angle = dot(rotater, adjusted_uv)/(length(rotater)*length(adjusted_uv));
```

放射高光、横向 / 竖向流动高光、总强度：

```glsl
//////////////放射高光
half fac2 = max(min(5*cos(_holo.g*0.3 + angle*3.14*(2.2+0.9*sin(_holo.r*1.65 + 0.2*_holo.g)))
    - 4 - max(2-length(20*adjusted_uv), 0), 1), 0);

//////////////横向高光
half fac3 = 0.3*max(min(2.*sin(_holo.r*5. + uv.x*3. + 3.*(1.+0.5*cos(_holo.r*7.)), 1), -1);

//////////////竖向高光
half fac4 = 0.3*max(min(2.*sin(_holo.r*6.66 + uv.y*3.8 + 3.*(1.+0.5*cos(_holo.r*3.414)), 1), -1);

half maxfac = max( max(fac, max(fac2, max(fac3, max(fac4, 0.0)))) + 2.2*(fac+fac2+fac3+fac4), 0);
```

**注意**：视频到 `maxfac` 就结束、直接切回卡面，`maxfac` 怎么变成颜色**没有露出**。本目录的实现是推断：`screen` 叠加 `clamp(maxfac,0,1) * mix(白, 彩虹, 0.55)`，再按 `delta` 加权。

---

## Shader 2 · 多彩 Polychrome（BV1CH4y1A7aW）

干涉场与 `res` 与 Shader 4 **完全相同**（常量一字不差），收尾换成 HSV：

```glsl
///////////彩虹
hsl.x = hsl.x + res + rayOffset.y*0.04;
hsl.y = min(0.6, hsl.y+0.5);
tex.rgb = RGB(hsl).rgb;
```

差别就在这三行：色相整圈转（`res` 是 0..1）、饱和度直接加 0.5 且封顶 0.6、不再走 HSL 的「提亮到粉彩」那一步，所以是**浓彩虹**而不是 Shader 4 的淡粉彩。

视频里另有一张黑到白的渐变图，是 `res` 的值域预览（Shader Graph 里 `res` 的输出预览），不是额外纹理。

---

## Shader 3 · 反转（BV1eC411H7Xk）

> **本效果已从 `index.html` 移除**：按用户反馈，反转卡把卡面读没了，演示页只保留闪箔 / 镭射 / 多彩三个。下文的转录仍然有效，作为资料保留。

五条斜向波纹（视频里 fac..fac5 五个黑白条纹预览就是它们），特征参数是 Balatro 内置的 `BalatroTime` 与 `offsetSpeed`：

```glsl
half fac  = 0.8 + 0.9*sin(11.*uv.x+4.32*uv.y + offsetSpeed*12*BalatroTime + cos(offsetSpeed*5.3*BalatroTime + uv.y*4.2 - uv.x*4.));
half fac2 = 0.5 + 0.5*sin(8.*uv.x+2.32*uv.y + offsetSpeed*5*BalatroTime - cos(offsetSpeed*2.3*BalatroTime + uv.x*8.2));
half fac3 = 0.5 + 0.5*sin(10.*uv.x+5.32*uv.y + offsetSpeed*6.111*BalatroTime + sin(offsetSpeed*5.3*BalatroTime + uv.y*3.2));
half fac4 = 0.5 + 0.5*sin(3.*uv.x+2.32*uv.y + offsetSpeed*8.111*BalatroTime + sin(offsetSpeed*1.3*BalatroTime + uv.y*11.2));
half fac5 = sin(0.9*16.*uv.x+5.32*uv.y + offsetSpeed*12*BalatroTime + cos(offsetSpeed*5.3*BalatroTime + uv.y*4.2 - uv.x*4));
```

「调整分布」——每通道减去 `delta` 再加回 `delta*maxfac`，红绿两通道带 `fac5` 反号偏移，这就是看起来像反转 + 色散的来源：

```glsl
//////////调整分布
tex.r = tex.r - delta + delta*maxfac*(0.7 + fac5*0.27) - 0.1;
tex.g = tex.g - delta + delta*maxfac*(0.7 - fac5*0.27) - 0.1;
tex.b = tex.b - delta + delta*maxfac*0.7 - 0.1;
tex.a = tex.a*(0.5*max(min(1., max(0, 0.3*max(low*0.2, delta) + min(max(maxfac*0.1, 0.), 0.4))), 0)
       + 0.15*maxfac*(0.1+delta));
```

「色调 2」——最后压暗一半再叠加一个青色（视频中 Color 节点取值 R 0.4 / G 0.79 / B 0.8）：

```glsl
tex.rgb = tex.rgb*0.5 + rayColor;
```

另有一句出现在「色相」小节前，作用是把整体提亮成冷白：

```glsl
SAT.z = 0.2+SAT.z;
tex = RGB(SAT) + 0.8*half4(0.31,0.39,0.41,0.);
```

**注意**：Shader 3 的 `maxfac` 汇总行视频没露出，本目录按 Shader 1 的同构写法推断为 `0.5*max(fac, max(fac2, max(max(fac3,fac4),fac5)))`；`delta` 在成片里明显小于 1，demo 里给该效果的 `deltaK` 是 0.35（等效 delta≈0.35）。

---

## 复刻时补齐的约定（视频没露出）

| 符号 | 取值 | 理由 |
| --- | --- | --- |
| `uv` | 图集内该卡的 0..1 UV | 与 `uv.x*gridSize*20.` 量级吻合：全卡 8 列网格 |
| `uv_scaled_centered` | `(uv - 0.5) * uSize * uField`，`uSize = (240, 360)` | Shader 4 用像素坐标（彩虹是横向大团块）；Shader 2 要 `uField = 0.5` 才是视频里那种大团块，否则干涉场频率过高成了彩虹噪点 |
| `adjusted_uv` | `(uv - 0.5) * (0.667, 1.0) * uField`，Shader 1 取 `uField = 0.18` | 视频未露出定义；0.5 倍是为了让同心圆数目和视频接近，否则高频摩尔纹 |
| `uShift` | 干涉场中心偏移：网格 0 / 闪箔 0 / 多彩 `(-300, 1500)` | 视频里多彩是**平直的斜向大色带**；同心圆弧会被看成「卡面鼓包、凹凸不平」。把场心推到卡外远处，弧线在卡内就近似直线 |
| `gridSize` | `1.25`（默认） | 全卡约 8 条竖纹、7 组斜纹，与视频一致 |
| `delta` | 滑块默认 0.9，各效果再乘系数：镭射 0.9 / 闪箔 0.85 / 多彩 0.7 | 视频里原卡始终看得清，所以不是满强度覆盖；多彩按用户要求再淡一档 |
| `rayOffset.x` | 指针横向位置 `-1..1` | 视频里无指针，效果自己会动，rayOffset 只给相位偏移 |
| `t` / `BalatroTime` | 秒 | 除数在秒单位下才得到视频那种缓慢流动 |
| `_holo.r` / `_holo.g` | 都取 `uTime` | 视频未露出 `_holo` 的定义，但 `_holo.r*5.`、`_holo.r*0.1221` 这类量级说明它就是秒级相位；取同值即可复现观感 |

## 观感要点（复刻对不对看这几条）

1. 网格＝竖条纹 + 两组 45/20 斜纹取 max，交点更亮，所以是三角格而不是方格。
2. 网格线只改色相不改亮度；`hsl.z` 的提亮是全图统一的，线内线外明度一致。
3. 色相来自 `res * fac`，`res` 是三层圆波干涉，颜色沿卡面成团流动，不是固定彩虹。
4. `hsl.z*0.6+0.4` 抬底线、`hsl.y*1.3` 推饱和，整卡过曝粉彩是原效果的副作用，不是 bug。
5. 镭射（Shader 1）三層叠加：同心圆波打底、放射扇形是主角、横竖流动高光只做点缀；四者用 `max` 取并集、再用 `sum` 放大，所以亮部会连成片。
6. 反转（Shader 3）因为每通道都先减 `delta`，成片必然偏暗、只剩高光条纹，最终被 `*0.5 + 青色` 拉成冷青色——这是效果的本意，不是还原失败。
7. 三个效果对封面底色都极敏感：白底会把彩虹洗掉（`hsl.z*0.6+0.4` 直接推到 0.9+），饱和底才出效果。
