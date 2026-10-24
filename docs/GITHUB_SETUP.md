# 远端仓库接入说明（GitHub）

> 2026-10-24 更新：用户已授权并在完成隐私与历史清理、复验通过后，将现有 `kayins897/roost` 仓库公开。旧“必须保持private”的说明不再构成约束。仓库地址：`git@github.com:kayins897/roost.git`（SSH over 443）。

## 本机网络事实（2026-10-24 实测）

| 目标 | 结果 |
| --- | --- |
| `https://api.github.com` | 200，可用 |
| `https://github.com` | 超时，不可用 |
| `ssh.github.com:443` | 可建立连接 |
| 本机 8080 端口 | 是 `steamwebhelper`，不是代理 |

因此**不能用 HTTPS 推送**，必须走 SSH over 443。`~/.ssh/config` 已配置：

```
Host github.com
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/id_ed25519_qiyu
  IdentitiesOnly yes
```

这样 `git@github.com:owner/repo.git` 会自动走 443 端口，无需改远端地址。

## 一次性准备（需要仓库所有者本人操作）

1. 把 `~/.ssh/id_ed25519_qiyu.pub` 的内容添加到 GitHub：
   Settings → SSH and GPG keys → New SSH key（类型 Authentication Key）。
2. 在 GitHub 新建**私有**仓库，**不要**勾选 Initialize with README / .gitignore / license（否则首推会冲突）。
3. 验证：`ssh -T git@github.com`，成功时返回 `Hi <username>! You've successfully authenticated...`。

## 接入命令

```powershell
cd D:\AI\project\栖域\qiyu-desktop
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
git push origin --tags
```

## 仓库边界（已确认）

- 纳入版本管理：`src/`、`desktop/`、`scripts/`、`public/`、`design/`、文档、字体许可、CI 配置。
- 明确排除：`node_modules/`、`release/`（发行包）、`evidence/`（截图与验证日志）、`.backups/`（源码备份）、`dist/`、`desktop-build/`、`.env*`、`*.sqlite`、`*.db`，以及用户私人收藏、导入清单与验证截图（保留在本机私密备份）。
- 因此**克隆仓库不能直接得到安装包或历史截图**；发行包通过 GitHub Release 附件分发。验证证据的 JSON 汇总保留在本机，以保证"哪次验证对应哪份代码"可追溯。
- 隐私清理记录（2026-10-24）：测试夹具统一改用专用合成 SteamID；文档去除个人库存统计与私人导入记录引用。因个人统计文本存在于多个历史版本、无法可靠逐条清除，公开仓库历史收敛为单一干净基线提交：原 18 个提交及 `baseline-0.4.12` 标签的完整历史保留在所有者本机私密备份，不入库。经 `git filter-repo --sensitive-data-removal` 处理、远端按原 SHA 期望值 lease 保护更新、并从远端重新克隆逐对象复验通过后，仓库按用户授权公开。个人收藏、Steam 账号资料与私密备份不入库。

## CI 状态

`.github/workflows/ci.yml` 从未在 GitHub 上运行过。桌面阶段（`verify-desktop.cjs` / `verify-features.cjs`）依赖真实 Electron 窗口，托管 runner 上能否稳定通过未经验证，因此首次推送前把触发方式改为手动，避免用未验证的红叉污染历史；验证通过后再恢复 `push` 触发。
