# 体验版配置检查清单

体验版只用于真实数据内测和提审前验证。发布前逐项确认：

- [ ] 小程序 AppID 已替换为真实 AppID。
- [ ] `apps/miniapp/project.config.json` 中 `urlCheck` 不再关闭。`urlCheck=false` 只适合本地调试。
- [ ] API 使用 HTTPS 域名，不使用 `localhost`、局域网 IP 或 HTTP。
- [ ] 微信公众平台已配置 request 合法域名，且与 `apps/miniapp/config/test.ts` 中的 API 域名一致。
- [ ] `apps/miniapp/config/index.ts` 已切换到 `testConfig`。
- [ ] `apps/miniapp/config/test.ts` 中的 API 域名已替换为真实 HTTPS API。
- [ ] 没有把 `https://test-api.example.com` 带到体验版。
- [ ] 微信开发者工具上传前没有依赖“不校验合法域名”。
- [ ] 微信公众平台 request 合法域名与 `test.ts` 域名完全一致，包括协议、主域名和端口规则。
- [ ] 后台已有至少 5 条已发布赛事。
- [ ] 真实赛事数据不包含 `example.com`。
- [ ] 全项目不出现报名直达禁用文案。
- [ ] 赛事详情合规提示存在：`AI 整理，仅供参考，报名以官方为准。`
- [ ] “前往官方确认”弹窗正常，能复制官方链接。
- [ ] 上传体验版前已抽查详情页合规提示。
- [ ] 上传体验版前已抽查“前往官方确认”弹窗。
- [ ] 上传体验版前已在代码和页面中检查没有报名直达禁用文案。
- [ ] 反馈可提交。
- [ ] 后台可查看并处理反馈。

## 人工准备项

1. 准备已备案、可访问的 HTTPS API 域名。
2. 在微信公众平台配置 request 合法域名，并确认域名与 `apps/miniapp/config/test.ts` 完全一致。
3. 替换小程序 AppID。
4. 将真实 HTTPS 测试 API 写入 `apps/miniapp/config/test.ts`，不要保留 `https://test-api.example.com`。
5. 将 `apps/miniapp/config/index.ts` 切换为：

   ```ts
   import { testConfig } from './test';

   export const config = testConfig;
   ```

6. 将 `urlCheck` 恢复为开启状态。体验版和提审前需要开启合法域名校验。
7. 使用真实数据内测流程导入并发布至少 5 条赛事。
8. 访问测试 API `/health`，确认 API 与数据库都正常。
9. 上传体验版前，重新检查首页、赛事列表、详情页、收藏、反馈和赛前清单。
