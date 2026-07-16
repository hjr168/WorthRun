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

## 注意事项

- `urlCheck=false` 只允许开发调试，不能用于体验版上传、提审或正式发布。
- `test.ts` / `prod.ts` 已经不是占位域名，不要改回旧的占位域名。
- 体验版联调时回退使用 `testConfig`，发布前务必确认切回 `prodConfig`。
- 线上 API 缺少 `ADMIN_TOKEN_SECRET` 会直接启动失败，避免使用开发密钥上线。
- 提审前如独立部署正式环境，只需替换 `prod.ts` 的 `apiBaseUrl` 并同步微信公众平台 request 合法域名。
- 小程序码依赖 `WX_APPID` / `WX_APPSECRET`，未配置时分享图降级为占位提示，不影响其他功能。
