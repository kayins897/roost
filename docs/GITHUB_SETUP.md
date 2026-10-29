# GitHub 仓库与开发入口

长期接手先读 [阅读指南](process/README.md) 和 [任务表](tasks/README.md)。已批准规则、状态及去敏交接随任务分支提交，不能只留聊天；主分支合并和发布仍需明确授权。

栖域的公开仓库是 [kayins897/roost](https://github.com/kayins897/roost)，Windows免安装包从 [Releases](https://github.com/kayins897/roost/releases) 下载。源码公开不代表已选定开源许可证；当前仍为 `UNLICENSED`，许可证由所有者决定。

## 获取源码

```powershell
git clone https://github.com/kayins897/roost.git
cd roost
npm ci
npm run setup:desktop
npm test
npm run desktop:build
```

开发与原生验收使用Windows、Node.js 24及npm。需要SSH的开发者自行配置GitHub密钥；网络阻止SSH默认端口时，可参照GitHub官方的 [SSH over HTTPS端口说明](https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port)。本项目不要求特定本机路径、密钥文件名或代理配置。

## 验证入口

- `npm run test:features`：构建并验收当前收藏工作区。
- 当前定向入口见 README 和 `.github/workflows/ci.yml`，包含批量收录、书籍、影视、语言字体、评分分段、游戏卡面及 Bento 专项。
- `npm run test:workflow -- --list`：只读列出历史综合套件；部分旧卡面／分类断言尚未适配，不作为本版全量通过证明。
- 桌面测试使用隔离临时目录，浏览器测试使用独立上下文与合成收藏。浏览器套件依赖Microsoft Edge，必要时先运行 `npx playwright install msedge`。

验证 CI 保持手动触发；预发行工作流只由版本标签触发。托管 Windows runner 上的原生窗口验证尚未验收，不把本机通过等同于 CI 通过。

## 仓库与发行边界

- 跟踪源码、测试脚本、公开设计参考、字体及其许可、文档与CI配置。
- 不跟踪真实收藏、私人导入清单、账号或密钥、本地交接文档、私密历史备份，以及 `node_modules/`、`dist/`、`desktop-build/`、`release/`、`evidence/`。
- 清理前完整历史只保留在所有者本机私密备份。继续开发使用清理后的公开基线；迁回临时成果时逐文件核对，不恢复旧Git目录、私密夹具或旧历史引用。
- 清理当前文件不代表远端历史与缓存已清除。远端历史收尾由所有者在私密流程中跟进；相关对象标识、工单材料与操作记录不写入公共文档。
- 日志和截图即使来自测试，也需确认不含本机身份或真实收藏后再分享。本地证据与发布附件的验证摘要分开处理。

## 免安装发行

按 README 先更新版本及变更说明、完成源码验收。普通分支推送与 PR 不会发布；只有得到所有者明确授权、将提交合入 main 并推送匹配版本标签后，才触发 Windows 免安装预发行工作流。旧发行包保留，线上构建与本地构建分别核验，不混用校验值。详见[免安装发布流程](release/PUBLISHING.md)。
