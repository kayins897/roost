# v0.4.33 影视收藏与观看记录交接

## 状态与边界

- 基线：0.4.32／50215202cc6f897f8569b3724d9abd65c603909e。
- 集成分支：`codex/screen-workspace-v0433`；独立工作树，原qiyu-desktop的历史未提交修改保留。
- domain独立提交2a5a5c7，集成为3e29857；UI独立提交1dfdd52，集成为3cc2d3f。最终根接线、测试与交付提交以Git记录和成品SOURCE.json为准。
- 仅本地验收候选，未合main、未推送或发布；只交Windows x64免安装版。

## 已实现

沿用正式主题、居中搜索、胶囊分类、紧凑筛选、标签区、封面／列表、右侧主题片单。影视详情用居中Bento呈现封面、观看安排与季集、评分、印象、资料、标签、看过历史、观看足迹和默认折叠长文。

业务规则见[影视模块](../product/SCREENS.md)。存储保持schemaVersion=1，可选扩展只在明确编辑时写入，不启动迁移。旧字段和未知扩展保留；备份、修订检查与原子保存使用既有仓储。

## 修改边界

- `src/domain/screens*`：纯操作、验证与兼容推导；types/library/catalog/steamImport接入可选字段与补缺规则。
- `desktop/metadata.ts`：豆瓣影视资料解析，含演员／地区／片长／集数／公共评分／简介；修正HTML空白评分误入0。
- `src/presentation/features/screen/*`：影视工作区与独立组件，复用现有书籍／库控件和主题token。
- App/controller、WorkEditor及其screenEditor辅助、SteamLibraryImport：沿用保存链接线；手动与批量可直接指定观看安排。
- QuickEditor只扩展影视既有标签目录选择，不改游戏四组标签规则。
- `build/demo-library.json`只添加合成影视示例；不含账号、真实收藏或原始用户数据。

## 审查与验证入口

- 非作者只读审查发现并修复：空HTML评分变0；合法0集数阻止资料编辑；移入回收站后旧菜单复活。
- `npm test`：263项通过。
- `npm run desktop:build`：通过，含TypeScript；Vite保留已有大chunk提示。
- `node scripts/verify-screens.cjs [成品EXE路径]`：隔离真实Electron验证；源码及成品结果分别在`evidence/screens-v0433/source|packaged/validation.json`。覆盖零写浏览、进度／日志／轮次分离、0／未知、重看历史、修订冲突草稿、标签／片单、回收站、手动与批量、窄窗和进程重启。
- `verify-books-production.cjs`与`verify-game-card-controls.cjs`：回归前版书籍15项、游戏卡片13项，结果在各自evidence目录。
- 独立UI作者另用合成LocalStorage完成15项浏览器操作，不能代替本集成的原生结果。
- 最终成品资产核对、ZIP哈希与实际通过数量见交付目录的验收报告；不能仅凭本文推定成品通过。

## 未做与限制

无新依赖、付费API或账号凭据。本轮未重跑真实豆瓣网络请求；解析使用合成HTML与JSON-LD测试，实际访问仍可能受到限流或验证码影响。电影／剧集的观看来源手动填写；无自动播放追踪、逐集打勾、自动分季、账号片单同步。日历仍为预览。

回退前保留升级前备份及新版`.roost`完整备份；旧版无法编辑新字段，不应交替写同一库。完整恢复使用备份副本，不覆盖唯一的用户数据目录，详见[数据兼容](../../DATA_COMPATIBILITY.md)。

## 接力操作

1. 核对当前分支、HEAD和工作区状态；从交付SOURCE.json确定被测提交，不从版本号猜功能。
2. 先读本页、SCREENS产品规则、DATA_COMPATIBILITY；只复核新增提交和失败报告。
3. 新需求独立分支开发，App/controller/仓储保持唯一写入者；不得未经审查合main。
4. 执行上面单测／构建及对应原生专项；所有UI数据均用脚本生成的独立temp目录。
5. 记录修改文件、结果、未验证项与回退方式；ZIP使用功能＋版本号目录，默认不做安装包。
