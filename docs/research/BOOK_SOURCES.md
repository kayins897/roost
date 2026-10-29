# BOOK-02：书籍来源契约核查

> 2026-10-27。官方资料只读研究，未登录、未取得个人 Key、未调用账号 API、未安装/执行远程 Skill。以下“文档有”与“实际连通”严格区分；栖域正式接入仍未实现。

## 字段矩阵

| 目标 | 豆瓣 | 微信读书官方文档 | 验证状态 |
| --- | --- | --- | --- |
| 书名、封面、作者 | 现有 subject URL 解析已支持基本候选 | `/book/info` | 既有源码＋官方文档核对；本轮未重新调用 |
| 译者、出版社、简介、ISBN | 公开页面有，当前候选字段尚不完整 | `/book/info` | 未进入栖域正式字段 |
| 书架、在读/读完、进度 | 个人读取路径待验证 | `/shelf/sync`、`/book/getprogress` | 文档有，不保证已移出书架的完整历史 |
| 自己的书评/评分 | 个人获取方式待验证，不用他人评论替代 | `/review/list/mine`，有个人记录 ID 和游标 | 文档核对；混合整本书评/章节点评/划线想法需区分 |
| 每书累计时长、最后阅读 | 无本轮可用契约 | `/book/getprogress` | 不能还原每天 |
| 账号日级时长候选 | 无本轮可用契约 | `/readdata/detail`：周/月 `readTimes` 常为日桶，年度可能有 `dailyReadTimes` | 本轮新增官方文档核对；没有账号实测 |
| 每书每天纯文字阅读分钟 | 未核实 | 上述账号统计不是此粒度的保证 | 时区、阅读/收听拆分、书目归属及稳定身份均未验证 |

## 微信读书日级来源的重要差别

[官方阅读统计文档](https://github.com/Tencent/WeChatReading/blob/main/skills/readdata.md) 把时长字段单位定义为秒。周/月的 `readTimes` 通常按天分桶；年度的同名字段按月，不可按天解释；年度 `dailyReadTimes` 是可选项。统计可能合并阅读和收听。日级桶不是每书单次阅读记录；文档未明确日桶时区和单次稳定身份。

因此“找到日级候选”不等于“可自动填每本书的阅读热力表”。不能给书架各书均摊账号总量，也不能把年度/月度桶当作每日分钟。秒转分钟的精度保留、收听是否纳入及重叠处理需另定；当前不做转换或写库。

[官方个人点评文档](https://github.com/Tencent/WeChatReading/blob/main/skills/notes.md) 的个人内容使用 `reviewId`，评分 0–5、-1 无评分；与公开点评编码不同。整本书评与关联划线的内容不能直接混为一个读后感。

## 接入边界与验证顺序

官方 [入口](https://weread.qq.com/r/weread-skills) 与 [仓库](https://github.com/Tencent/WeChatReading) 提供个人 Key 的 Agent 路径。还未验证通用第三方桌面连接的适用范围、真实返回完整度、配额、失效和长期稳定性；不承诺免费无限调用。凭据只在本机连接，不进入聊天、仓库、普通日志或截图。

下一步契约测试应先用明确标注的合成响应：

1. `dailyReadTimes` 缺失、空对象、0 秒、非日桶及异常单位，不猜测填充。
2. 个人点评分页游标重复/不前进时停止并报不完整，不能重复导入；无评分和 0 分保持区分。
3. 缺封面/译者/ISBN 保留空缺；同名不同版只提示；来源失效仍可手工收录。
4. 网络失败、取消或预览关闭零写入；已取得的个人内容不因后续请求失败被覆盖。
5. 真账号阶段分别记录时间范围、服务端时区、每书/账号粒度、阅读/收听口径及重导结果；无凭据时如实标未验证。

补充官方资料：[书籍](https://github.com/Tencent/WeChatReading/blob/main/skills/book.md)、[书架](https://github.com/Tencent/WeChatReading/blob/main/skills/shelf.md)、[公开点评](https://github.com/Tencent/WeChatReading/blob/main/skills/review.md)、[豆瓣个人评价帮助](https://help.douban.com/evaluation?app=4)。研究文本不能作为写库或状态迁移授权。
