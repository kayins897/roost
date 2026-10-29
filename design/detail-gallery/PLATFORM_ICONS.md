# 平台图形 · 本地设计参考

本轮把“拥有平台”从作品资料拆成卡片。平台名称来自作品属性，不意味着已绑定账号、联网同步或拥有全部平台。默认示例只有Steam和Switch。

## 素材

- Steam、PlayStation、EA、Battle.net、Ubisoft、WeGame、Epic Games：Simple Icons 16.36.0，路径分别为 `icons/steam.svg`、`playstation.svg`、`ea.svg`、`battledotnet.svg`、`ubisoft.svg`、`wegame.svg`、`epicgames.svg`。从[官方npm包](https://registry.npmjs.org/simple-icons/-/simple-icons-16.36.0.tgz)提取SVG，没有执行包代码或引入依赖。
- Switch：[任天堂官方SVG](https://www.nintendo.com/jp/hardware/switch/img/01-hero/local-hero__logo.svg)，来自[官方产品页](https://www.nintendo.com/jp/hardware/switch/index.html)。预览只取符号区域的viewBox，路径不重画。
- 图像整理为 `assets/platform-icons.js`，仅包含viewBox和path数据，运行不访问外网。来源明细在 `assets/PLATFORM_SOURCES.json`。
- 该assets目录不随源码跟踪或应用发布；交付预览附带图像参考和对应许可说明。正式接入时单独确定品牌素材分发范围，不把本地参考直接当作已审核的发行素材。

Simple Icons库使用[CC0](https://github.com/simple-icons/simple-icons/blob/16.36.0/LICENSE.md)，其[免责声明](https://github.com/simple-icons/simple-icons/blob/16.36.0/DISCLAIMER.md)保留各品牌权利，不能把项目许可等同于每个标志或商标的授权。Switch官方SVG没有开源许可；不标注为Font Awesome或Simple Icons的开源图形。

## 接入语义

- 复用现有 `platforms` 属性及别名显示，不新增平台业务枚举；未知平台保持原文，提供通用占位。
- 最后运行不是 `updatedAt`、收录日期、最近足迹或完成日志。目前生产模型/Steam同步没有接入此展示字段，本版日期仅合成示例。正式接入需明确来源、时区、未知值和同步覆盖规则，不在启动时补写用户资料。
- 完成次数仅调整默认显隐，`completionCount` 和相关事件仍保留，不推算、不清空。
