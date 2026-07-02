# 微信小程序体验版上传检查清单

上传体验版前逐项确认：

- [ ] 使用真实 AppID：`wxb968bfb48f9a1d2b`。
- [ ] `apps/miniapp/config/index.ts` 指向 `testConfig`。
- [ ] `apps/miniapp/config/test.ts` 的 API 为 `https://run-api.huangjiarong.top`。
- [ ] 页面和请求工具中没有硬编码 API 地址。
- [ ] 微信公众平台 request 合法域名已配置 `https://run-api.huangjiarong.top`。
- [ ] `apps/miniapp/project.config.json` 中 `setting.urlCheck` 为 `true`。
- [ ] 微信开发者工具上传体验版前，关闭“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。
- [ ] 体验版不使用 `localhost`、局域网 IP、HTTP 或 `example.com`。
- [ ] 赛事详情页显示 `AI 整理，仅供参考，报名以官方为准。`
- [ ] 官方入口按钮文案为 `前往官方确认`。
- [ ] 全项目不出现报名直达禁用文案。
- [ ] 线上 API `/health` 可访问，且数据库检查为 ok。
- [ ] 线上 API 设置 `NODE_ENV=production`。
- [ ] 线上 API 设置强随机 `ADMIN_TOKEN_SECRET`。
- [ ] 线上 API 未设置 `ALLOW_DEV_ADMIN=true`。
- [ ] 后台默认密码已重置。

`urlCheck=false` 只允许本地开发调试使用，不能用于体验版上传、提审或正式发布。
