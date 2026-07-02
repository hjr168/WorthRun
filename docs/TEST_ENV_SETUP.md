# 测试环境部署清单

本文用于辅助搭建“哪场值得跑”测试环境，供体验版联调和提审前验证使用。测试环境仍保持 V0.1 边界：人工维护赛事，官方入口统一为“前往官方确认”，赛事信息提示为“AI 整理，仅供参考，报名以官方为准。”

## 1. 需要准备的资源

- 一台可运行 Node.js 的测试服务器或云应用运行环境。
- 一个独立 PostgreSQL 测试数据库。
- 一个可公网访问的 HTTPS API 域名。
- 一个后台静态站点托管环境。
- 微信小程序真实 AppID。
- 微信公众平台管理员权限，用于配置 request 合法域名。
- 测试环境专用管理员密码和 token 签名密钥。

## 2. PostgreSQL 测试数据库

1. 创建独立数据库和数据库账号，不复用本地开发库。
2. 将连接串写入测试环境 `DATABASE_URL`。
3. 在测试环境执行：

   ```bash
   pnpm install
   pnpm db:generate
   pnpm db:migrate
   pnpm db:seed
   ```

4. 导入真实内测数据前，先使用 dry-run 校验 CSV：

   ```bash
   pnpm db:import-events -- ./docs/real-events.local.csv --dry-run
   ```

## 3. API 部署步骤

1. 在服务器拉取代码并安装依赖。
2. 配置 `.env` 或平台环境变量。
3. 执行数据库迁移。
4. 构建并启动 API：

   ```bash
   pnpm --filter @worth-running/api build
   pnpm --filter @worth-running/api start
   ```

5. 通过反向代理或平台网关暴露 HTTPS 域名。
6. 访问 `/health`，确认 API 和数据库都正常。

## 4. 后台部署步骤

后台是 Vite 静态站点，构建时需要写入测试 API 地址：

```bash
VITE_API_BASE_URL=https://run-api.huangjiarong.top pnpm --filter @worth-running/admin build
```

部署 `apps/admin/dist` 到静态站点后，确认后台可以登录、查看赛事、执行发布前检查和处理反馈。

## 5. 小程序 testConfig 配置

1. 确认 `apps/miniapp/config/test.ts` 中的 `apiBaseUrl` 为 `https://run-api.huangjiarong.top`。
2. 将 `apps/miniapp/config/index.ts` 切换到：

   ```ts
   import { testConfig } from './test';

   export const config = testConfig;
   ```

3. 小程序体验版不能继续使用 `localhost`、局域网 IP 或 HTTP。
4. 小程序不能继续使用旧的测试占位域名。

## 6. 微信 request 合法域名配置

- 在微信公众平台配置 request 合法域名。
- 合法域名必须与 `apps/miniapp/config/test.ts` 中的 API 域名一致。
- 上传体验版前，`apps/miniapp/project.config.json` 不应继续关闭 `urlCheck`。
- 开发者工具中的“不校验合法域名”只允许本地开发调试使用。

## 7. HTTPS 证书要求

- API 必须使用有效 HTTPS 证书。
- 证书链需要被微信客户端信任。
- 体验版和提审前不能使用自签名证书。
- 不能使用 HTTP、`localhost` 或局域网 IP 作为体验版 API 地址。

## 8. 环境变量说明

| 变量 | 用途 | 测试环境要求 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 | 使用独立测试库，不提交到仓库 |
| `API_PORT` | API 监听端口 | 例如 `4000`，由平台网关或反向代理转 HTTPS |
| `NODE_ENV` | Node 运行环境 | 必须为 `production` |
| `ADMIN_TOKEN_SECRET` | 后台登录 token 签名密钥 | 使用高强度随机值，不使用 `change-me-in-production` |
| `ALLOW_DEV_ADMIN` | 本地开发无 token fallback 开关 | 测试环境禁止设置为 `true` |
| `CORS_ORIGINS` | 后台管理站点浏览器跨域白名单 | 按后台域名配置，多个域名用逗号分隔 |
| `VITE_API_BASE_URL` | 后台构建时注入的 API 地址 | 使用 `https://run-api.huangjiarong.top` 或对应真实 HTTPS 测试 API |

安全提醒：

- 测试环境不要使用 `admin/admin`。
- `ADMIN_TOKEN_SECRET` 不要使用 `change-me-in-production`。
- 测试环境不要设置 `ALLOW_DEV_ADMIN=true`。
- 数据库连接串、token 密钥和管理员密码不要写入 Git。

## 9. 测试环境启动后验收步骤

1. 访问 `https://run-api.huangjiarong.top/health`，确认返回 `ok: true` 和 `database: "ok"`。
2. 使用后台 HTTPS 地址登录。
3. 立即重置默认管理员密码。
4. 后台导入或确认至少 5 条人工核验赛事。
5. 在后台打开赛事编辑页，确认小程序发布前检查可见。
6. 在赛事列表点击发布，确认只展示检查摘要并需要人工确认。
7. 小程序 `testConfig` 指向真实 HTTPS API。
8. 微信公众平台 request 合法域名与 `test.ts` 域名一致。
9. 体验版首页、列表、详情、收藏、反馈、赛前清单可正常访问。
10. 详情页保留合规提示，官方入口弹窗可复制官方链接。
11. 全仓库检查没有报名直达禁用文案。
12. 运行 `pnpm typecheck` 和 `pnpm build`，记录结果。
