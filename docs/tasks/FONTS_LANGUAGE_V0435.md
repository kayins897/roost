# 字体与双语界面 v0.4.35 交接

## 范围与状态

分支 `codex/fonts-language-v0435`，从影视候选 `f22e791` 继续。独立工作树，未合 main、未推送、未发布。正式旧工作区的未提交修改未触碰。本轮只实现免费离线字体选择、中英文界面和音乐入口撤下。

## 实现与边界

- 设置新增「语言与字体」：简体中文／English即时切换，不重挂载App；日期格式随语言显示，作品、作者、标签、感想及平台原文不翻译。
- 默认黑体 Inter＋Noto Sans SC、完整Noto Serif SC宋体、系统字体。新增宋体来自官方v2.003固定来源，OFL 1.1许可及SHA-256见 `public/fonts/sources.json`；无需运行时联网。
- 字体与语言分别持久化为 `qiyu.typography.v1`、`qiyu.interface.locale.v1` 本机偏好。失败时不伪报成功；损坏偏好回退默认，不改收藏。
- 翻译位于presentation显示边界与纯字符串字典，不更改domain分类值、schema或导入数据。英文表单仍写入原来的影视类型枚举。
- 撤下音乐Dock及新增／文本批量收录入口；混合清单明确报告跳过音乐。旧音乐记录和完整备份继续原样保留。未删除domain的music类型。
- 新增许可证目录 `LICENSES/fonts` 随免安装包提供。应用自身许可证保持原状。

## 主要文件

`src/shared/translate.ts`、`src/shared/locales/en*.ts`；`src/infrastructure/localePreferences.ts`、`typographyPreferences.ts`；`src/presentation/i18n/index.ts`；设置内LanguageSettings／TypographySettings；现有各TSX仅在显示边界接入t()。`main.tsx`初始化本机偏好，App和memo卡片订阅语言变化。`scripts/make-noinstall.cjs`附字体许可。

## 已运行验证

- `npm test`：277/277；`npm run desktop:build`通过（包含tsc）。Vite既有主包体积提示仍存在。
- `verify-interface-preferences.cjs`：源码原生Electron18/18，包括实际宋体加载、三字体切换、进程重启、收藏及备份字节不变、草稿保留、英文新增番剧仍保存中文枚举、混合导入与旧音乐保护。
- 英文390／768／1440宽的游戏、书籍、影视和设置共12张实际截图；检查页面横溢和标签分组文字碰撞。
- 源码既有回归：影视21、书籍15、游戏卡片13检查通过；全部使用隔离临时目录和合成收藏，未触碰真实用户数据。
- 原始运行证据在 `evidence/interface-v0435/source/`、`evidence/screens-v0434/source/`、`evidence/books-v0435/source/`、`evidence/game-card-v0435/source/`。影视脚本沿用旧证据目录名，不代表被测代码仍是0.4.34。
- 成品包验证结果及SHA-256另见交付目录验收报告；不将源码通过等同于成品通过。

## 人工验收、限制与回退

随包 `验收步骤.md` 为实际操作入口。少量原生文件对话框／平台原始报错可保留原文；本轮不提供用户内容自动翻译、不导入任意字体文件、不重新设计界面。

先用「启动演示.cmd」验收。正常启用前在旧版导出完整备份。没有收藏迁移，外观偏好独立于收藏；需要回退时保留新版完整导出，再用原版本及升级前备份副本恢复。不要用旧程序交替写含新扩展字段的收藏。

## 后续接力

先读本文件、SOURCE.json、交付验收报告及新增提交。新文案继续用完整模板及显式插值，勿将翻译文本写成业务枚举；不要递归翻译插值中的用户内容。可复用 `node scripts/verify-interface-preferences.cjs [成品EXE绝对路径]`。若后续增加语言、字体或修改布局，补实际覆盖，不用重做已通过功能。
