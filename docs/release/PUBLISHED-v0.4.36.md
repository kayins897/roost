# v0.4.36 预发行完成记录

2026-10-29，已按所有者授权合入 main，并发布 Windows x64 免安装预发行版。

- [发布页](https://github.com/kayins897/roost/releases/tag/v0.4.36)：`prerelease: true`、`draft: false`。
- 合并及打包提交：`368feb81e04650691f4b6ba629cc3768b127cc5d`。标签 `v0.4.36` 指向该提交；没有移动旧标签或重写历史。
- [发布工作流 40832976950](https://github.com/kayins897/roost/actions/runs/40832976950)：`success`，Windows build 全部 14 step 与 publish 全部 5 step 成功，无失败或跳过。
- 附件仅 `Qiyu-NoInstall-0.4.36-x64.zip`（191,475,251 字节）与 `SHA256SUMS.txt`，均为 `uploaded`。没有安装器。

ZIP SHA-256：

```text
38AD967E10C30877DE7469D0FA0805764B0CD9EE0F8DE4A0377BE90933B89A03
```

## 已核验

Windows 托管任务实际运行单测、桌面／免安装构建、ZIP 散列、ASAR 与随包文件对照、成品批量收录专项；独立 publish 任务重新校验传输后的 ZIP，再创建预发行。此结果不是完整手动 CI 或历史综合套件通过。

线上校验文件与 GitHub 资产 digest 一致。因附件整包回下载速度慢，本机整包下载未完成；另以 HTTP Range 实际读取 ZIP 中央目录及 `SOURCE.json`：86 项，版本 0.4.36、`dirty: false`、来源提交与上述合并提交相同。没有把分段核对写成完整下载散列验证。早先本机候选包的散列不同，不能与线上包混用。

本机 294 项单测及独立成品补验范围见[验收记录](../tasks/BATCH_INTAKE_V0436_ACCEPTANCE.md)；累计变更与审查边界见[发布说明](RELEASE-v0.4.36.md)和[审查记录](REVIEW-v0.4.36.md)。在线来源仍使用合成响应验证，未据此声称真实账号／网络已通过；真实收藏与原开发工作树的 16 处历史未提交改动均未触碰。

## 接力

新开发从远端 main 建独立分支。发布后仅追加本文等文档的提交不属于已打包标签，不要据此重打或覆盖同名附件。若发现产品问题，按正常修复／审查及新版本发布流程处理。
