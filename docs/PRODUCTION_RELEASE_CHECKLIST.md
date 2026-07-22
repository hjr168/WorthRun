# 正式版发布检查清单

本清单用于《哪场值得跑》小程序正式版发布与微信审核提交前的逐项确认。整合了 `PRE_SUBMIT_CHECKLIST.md`、`WECHAT_MINIPROGRAM_UPLOAD_CHECKLIST.md` 的内容，并新增正式版专用项。提审前请逐条勾选。

当前版本支持受限来源自动采集和解析，但只生成候选或变更告警，不自动修改、采纳或发布赛事，也不做官方报名闭环。赛事信息统一提示为「AI 整理，仅供参考，报名以官方为准」，官方入口统一文案为「前往官方确认」。

## 1. 小程序配置（代码层，已确认）

- [x] AppID 正确：`wxb968bfb48f9a1d2b`。
- [x] `apps/miniapp/config/index.ts` 指向 `prodConfig`。
- [x] `apps/miniapp/config/index.js` 与 `.ts` 同步，指向 `prodConfig`。
- [x] `apps/miniapp/config/prod.ts` 的 API 为 `https://run-api.huangjiarong.top`。
- [x] `apps/miniapp/project.config.json` 中 `setting.urlCheck` 为 `true`。
- [x] 页面和请求工具中没有硬编码 API 地址。
- [x] 不使用 `localhost`、局域网 IP、HTTP 或 `example.com`。
- [x] 无 `console.log` / `debugger` 调试残留。
- [x] 无隐私敏感 API（仅 `wx.setClipboardData`，无需在 `app.json` 声明 `permission`/`requiredPrivateInfos`）。
- [x] 「我的」页面 `isDev` 逻辑正确（`config.env === 'dev'` 在 prod 下为 false，开发调试区块自动隐藏）。

## 2. 微信公众平台（人工操作）

- [ ] request 合法域名已配置 `https://run-api.huangjiarong.top`。
- [ ] 服务类目已选择（参考 `MINIAPP_REVIEW_PREP.md`：体育 / 生活服务 / 工具 / 信息查询，以平台当前可选类目为准）。
- [ ] 小程序基本信息完整：名称、图标、简介、服务描述。
- [ ] 隐私协议已填写（参考 `PRIVACY_POLICY_DRAFT.md`，补全运营主体 / 联系邮箱 / 联系微信 / 通信地址等占位）。

## 3. 后端配置（人工确认）

- [ ] `NODE_ENV=production`。
- [ ] `ADMIN_TOKEN_SECRET` 已配置强随机值。
- [ ] 未设置 `ALLOW_DEV_ADMIN=true`。
- [ ] `/health` 可访问，且返回 database ok。
- [ ] 默认管理员密码已重置（`pnpm admin:reset-password -- admin "new-strong-password"`）。
- [ ] PM2 只有一个 `worth-running-api` 进程，API RSS 小于 220MB。
- [ ] 来源任务峰值 RSS 小于 180MB，未新增 Redis、队列、常驻 worker 或额外 cron。

## 4. 数据检查（人工确认）

- [ ] 至少 5 条赛事已发布。
- [ ] 每条已发布赛事有官方入口、来源名称、跑前判断、判断理由和确认清单。
- [ ] 没有 `example.com`。
- [ ] 没有报名直达禁用文案。
- [ ] 详情页合规提示存在：「AI 整理，仅供参考，报名以官方为准。」
- [ ] 官方入口按钮文案为「前往官方确认」。
- [ ] 「前往官方确认」弹窗可用（复制链接并说明）。
- [ ] 详情页已验证正常检查时间、无检查时间和“信息复核中”三种状态。
- [ ] 收藏列表的“信息复核中”标签不会遮挡长赛事名。

## 5. 微信开发者工具上传（人工操作）

- [ ] 上传代码前已关闭「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
- [ ] 版本号已填写（如 `1.0.0`）。
- [ ] 项目备注已填写。
- [ ] 上传后在微信公众平台「版本管理」提交审核。

## 6. 提审资料（人工准备）

- [ ] 审核备注文案已准备（参考 `MINIAPP_REVIEW_PREP.md` 第 7 节）。
- [ ] 截图已准备：
  - 首页
  - 赛事列表
  - 赛事详情
  - 赛事详情合规提示
  - 前往官方确认弹窗
  - 偏好设置
  - 我的收藏
  - 反馈纠错
  - 赛前清单
  - 配速计算器
- [ ] 联系方式或数据删除方式已确认。

## 7. 审核备注建议文案

可复制到微信审核备注，并按实际情况微调：

```text
本小程序为跑步赛事信息整理与赛前决策参考工具，不提供赛事报名交易服务。赛事详情页展示"AI 整理，仅供参考，报名以官方为准"提示；"前往官方确认"仅复制公开官方链接，用户需前往官方渠道确认赛事信息。当前版本不含社区、评论、用户发帖、付费报名、分享奖励等功能。
```

## 8. 发布前自测（真机）

- [ ] 首页根据偏好展示赛事，无偏好时展示全部近期赛事。
- [ ] 赛事列表筛选、搜索、分页加载正常。
- [ ] 赛事详情、合规提示、前往官方确认弹窗正常。
- [ ] 收藏 / 取消收藏、我的收藏正常。
- [ ] 偏好设置保存、重置、跳过正常。
- [ ] 反馈纠错提交正常。
- [ ] 配速计算器、赛前清单正常。
- [ ] 「我的」页面开发调试区块已隐藏（非 dev 环境）。
- [ ] 赛事详情页右上角「...」可转发给朋友、分享到朋友圈。
- [ ] 赛事详情页底部「分享图」可生成决策卡分享图。
- [ ] 分享图含赛事名、城市日期距离、报名状态、跑者标签、摘要、小程序码、合规提示。
- [ ] 分享图可保存到相册（相册授权拒绝时有引导设置）。
- [ ] 分享图底部保留「AI 整理，仅供参考｜报名以官方为准」。
- [ ] iOS 与 Android 多机型分享图排版正常。

## 9. V0.4.5 服务端发布与回滚

- [ ] 部署前已备份 PostgreSQL，并记录备份文件大小和 SHA-256。
- [ ] 同步源码时排除 `.env`、`node_modules`、构建产物和 `apps/miniapp/project.private.config.json`。
- [ ] 已执行 Prisma Client 生成和 `prisma migrate deploy`，未执行破坏性 down migration。
- [ ] admin 使用 `VITE_API_BASE_URL=https://run-api.huangjiarong.top` 显式构建。
- [ ] 本地及线上 admin 资产均不包含 `localhost:4000`，且包含正式 API 域名。
- [ ] `/health` 返回 database ok；公开赛事仍只有未来大湾区已发布赛事。
- [ ] 官方来源无变化运行只刷新 `sourceCheckedAt`；制造差异只创建告警，不自动修改赛事。
- [ ] 已在线完成一次告警 dry-run、应用和操作日志核对。
- [ ] 回滚代码时保留新增表和字段；如告警噪声异常，暂停相关来源或关闭自动运行，不删除告警数据。

## 10. 小程序码配置（V0.2，可选）

若要让分享图上的小程序码可扫码直达赛事详情：

- [ ] 已配置 `WX_APPID` 和 `WX_APPSECRET` 环境变量。
- [ ] `GET /api/wxacode?eventId=xxx` 返回 PNG（`curl -o code.png` 检查）。
- [ ] 未配置时分享图自动降级为占位文字，不报错。

## 11. V0.5.0 匿名选择与来源摘要

- [ ] 数据库迁移已创建 `user_event_choices` 和 `event_source_summaries`，旧赛事数据未被修改。
- [ ] 体验版验证首票、重复选择、切换和清除后，三项公开数量准确更新。
- [ ] 赛事详情响应和抓包均不包含匿名选择参与者列表或 `userKey`。
- [ ] “已报名”明确标注为用户自报，页面保留“匿名意向统计，不代表官方报名人数”。
- [ ] 来源摘要使用原生小程序页面，不使用 H5 或 `web-view`，无需配置业务域名。
- [ ] 无已发布摘要时详情页不展示入口；stale 摘要显示待复核提示。
- [ ] 已发布摘要均经过后台人工编辑或确认，生成草稿不会自动公开。
- [ ] 数据库和日志中没有完整网页正文、截图、Cookie、请求头或浏览器指纹。
- [ ] `pnpm source-summary:backfill` 已先 dry-run，apply 数量与预览一致。
- [ ] API PM2 仍为单进程，RSS 小于 220MB；单次摘要生成峰值小于 180MB，cron 数量不变。

## 12. V0.5.1 产品反馈与稳定性

- [ ] 旧版赛事纠错请求不传 `scope` 仍可提交，历史反馈数量和状态未变化。
- [ ] 产品反馈不关联赛事，只保存文字、固定页面标识、版本和关联问题编号。
- [ ] “我的”页及关键错误状态可以进入产品反馈，网络失败时保留正文和请求编号。
- [ ] 后台可分别筛选、预览和处理赛事纠错与产品反馈。
- [ ] API 错误响应和 `X-Request-Id` 使用同一服务端 UUID，日志不包含正文、IP 或 `userKey`。
- [ ] `/health` 返回发布版本与数据库延迟，`/api/admin/system-health` 返回 RSS 和 5xx 聚合。
- [ ] `ops/logrotate/worth-running` 已安装并通过 `logrotate -d`，未安装 PM2 常驻模块。
- [ ] API RSS 小于 220MB，反馈维护任务峰值小于 120MB，cron 数量没有增加。

## 13. 分享与版本更新中心

- [ ] 数据库已备份并应用 `20260721090000_share_settings_and_release_notes`迁移。
- [ ] `pnpm release-notes:bootstrap` dry-run 数量已核对，需要时再使用 `-- --apply` 创建历史草稿。
- [ ] 后台全局分享模板、单赛事覆盖、发起数据和版本日志权限已验证。
- [ ] 外部分享图主机名已配置 `SHARE_IMAGE_ALLOWED_HOSTS` 和微信合法域名；未使用外部图时保持内置默认。
- [ ] 只发布经人工确认的版本日志，草稿不对小程序公开。

## 14. V0.5.3 用户体系、增长与提醒

- [ ] 已备份 PostgreSQL 并执行 `20260722160000_user_growth_reminders` 迁移，原有收藏、选择、偏好和反馈数量不变。
- [ ] `USER_SYSTEM_ENABLED=false` 时公开赛事和旧版匿名功能正常；配置密钥后再通过体验版开启。
- [ ] OpenID 数据库只存密文与 HMAC，后台默认脱敏，查看完整 OpenID 会新增审计日志。
- [ ] 同一微信用户在两台真机首次绑定后，收藏去重、选择取最新、偏好取最新。
- [ ] 禁用用户只可浏览，不可修改资料、收藏、选择、反馈或订阅提醒。
- [ ] UniCloud 支付宝云函数已部署，JPEG/PNG/WebP、2MB 限制、过期/重放凭证、伪造回调和旧头像删除均通过真机验证。
- [ ] `worthrun-avatar` 函数详情的“云函数URL化” PATH 为 `/worthrun-avatar`，使用控制台显示的 `dev-hz.cloudbasefunction.cn` 测试域名；公网请求能到达函数。
- [ ] 支付宝云空间 `env-00jy6bpz3vhc` 已续期，剩余有效期不少于 30 天；当前控制台显示到期时间为 2026-08-26 23:59:59。
- [ ] UniCloud 云存储权限已设为仅云函数可读写，头像展示只使用短期 URL。
- [ ] 微信平台已配置 API 与 UniCloud 的 `request` / `uploadFile` / `downloadFile` 合法域名。
- [ ] 微信 `request` 合法域名包含 `https://run-api.huangjiarong.top`；`uploadFile` 包含 `https://env-00jy6bpz3vhc.dev-hz.cloudbasefunction.cn`；头像下载域名包含 `https://env-00jy6bpz3vhc.normal.cloudstatic.cn`。
- [ ] 隐私政策和微信隐私保护指引已声明 OpenID、头像昵称、跨设备恢复与赛事提醒用途。
- [ ] 两个订阅消息模板的 ID 和赛事/提示/日期字段键已按公众平台实际值配置，并完成真机验收，再开启 `REMINDER_FEATURE_ENABLED=true`。
- [ ] 依次执行 V0.5.3 `foundation`、`users`、`reminders` 预检，对应阶段均无 `BLOCK`。
- [ ] 提醒任务使用一次性 cron，PM2 仍只有一个 API 进程；API RSS < 220MB，提醒任务峰值 < 120MB。
- [ ] 后台生产资产不含 `localhost:4000`，“用户管理”和“增长与提醒”仅超级管理员可见；工作台显示用户、头像和提醒均已就绪。

## 注意事项

- `urlCheck=false` 只允许开发调试，不能用于体验版上传、提审或正式发布。
- `test.ts` / `prod.ts` 已经不是占位域名，不要改回旧的占位域名。
- 体验版联调时回退使用 `testConfig`，发布前务必确认切回 `prodConfig`。
- 线上 API 缺少 `ADMIN_TOKEN_SECRET` 会直接启动失败，避免使用开发密钥上线。
- 提审前如独立部署正式环境，只需替换 `prod.ts` 的 `apiBaseUrl` 并同步微信公众平台 request 合法域名。
- 小程序码依赖 `WX_APPID` / `WX_APPSECRET`，未配置时分享图降级为占位提示，不影响其他功能。
