# 部署说明

本文是通用部署说明，不绑定具体云厂商。体验版和正式环境上线前，请先完成真实数据内测流程与体验版配置检查。

## 1. API 服务

- API 需要 Node.js 运行环境，并使用仓库根目录的 pnpm workspace 安装依赖。
- API 依赖 PostgreSQL 数据库，部署前需要创建数据库并执行迁移。
- `.env` 至少需要配置：
  - `DATABASE_URL`：PostgreSQL 连接串。
  - `API_PORT`：API 监听端口，例如 `4000`。
  - `NODE_ENV=production`：线上 API 必须使用生产环境。
  - `ADMIN_TOKEN_SECRET`：后台登录 token 签名密钥，正式环境必须使用高强度随机值。
  - `CORS_ORIGINS`：后台管理站点浏览器跨域白名单，多个域名用英文逗号分隔。
  - `AI_INGEST_PROVIDER`：后台 AI 赛事源抽取模型提供方，支持 `glm`、`deepseek` 和 `openai`；推荐先用 `glm`，也可切到 `deepseek` 测试。
  - `ZHIPUAI_API_KEY` / `GLM_API_KEY` / `AI_INGEST_API_KEY`：`AI_INGEST_PROVIDER=glm` 时调用 GLM 抽取所需；不配置时不影响普通赛事 API，但手动抓取会失败。
  - `DEEPSEEK_API_KEY` / `AI_INGEST_API_KEY`：`AI_INGEST_PROVIDER=deepseek` 时调用 DeepSeek 抽取所需；默认模型为 `deepseek-v4-flash`，DeepSeek 官方说明旧模型名 `deepseek-chat` / `deepseek-reasoner` 将于 2026-07-24 废弃，不建议新接入使用。
  - `OPENAI_API_KEY` / `AI_INGEST_API_KEY`：`AI_INGEST_PROVIDER=openai` 时调用 OpenAI 抽取所需。
  - `AI_INGEST_MODEL`：AI 赛事源结构化抽取模型；留空时按 provider 使用默认值：GLM 为 `glm-5.2`，DeepSeek 为 `deepseek-v4-flash`，OpenAI 为 `gpt-5.5`。
  - `AI_INGEST_BASE_URL`：兼容 OpenAI SDK 的模型服务地址；留空时按 provider 使用默认值：GLM 为 `https://open.bigmodel.cn/api/paas/v4/`，DeepSeek 为 `https://api.deepseek.com`。
  - `AI_INGEST_USER_AGENT`：抓取来源页使用的 User-Agent，建议使用可联系到运营方的标识。
- 测试、体验版和正式环境禁止设置 `ALLOW_DEV_ADMIN=true`。
- API 对外访问需要 HTTPS 域名，体验版和提审不能使用 `localhost`、局域网 IP 或 HTTP。

常用命令：

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm --filter @worth-running/api build
pnpm --filter @worth-running/api start
```

## 2. PostgreSQL

- 创建独立数据库和账号。
- 将生产或测试数据库连接串写入部署环境的 `DATABASE_URL`。
- 部署后先访问 `/health` 确认 API 与数据库都正常，再验证后台登录和赛事接口。

## 3. 后台部署

- 后台是 React + Vite 静态站点，可构建后部署到任意静态托管或 Web 服务。
- 构建时需要通过 `VITE_API_BASE_URL` 指向对应环境 API。
- 后台登录依赖 API 的 `ADMIN_TOKEN_SECRET` 和数据库中的管理员账号。
- 不要把默认 `admin/admin` 用于测试或正式环境。上线前必须修改或替换管理员密码。

重置管理员密码：

```bash
pnpm admin:reset-password -- admin "new-strong-password"
```

该命令不会在控制台输出明文密码。

常用命令：

```bash
VITE_API_BASE_URL=https://run-api.huangjiarong.top pnpm --filter @worth-running/admin build
```

## 4. 小程序配置

- 体验版使用 `apps/miniapp/config/test.ts`，正式版使用 `apps/miniapp/config/prod.ts`。
- `apps/miniapp/config/index.ts` 需要切换到对应配置。
- 当前体验版 API 为 `https://run-api.huangjiarong.top`。
- `test.ts` 当前已使用真实 HTTPS API。
- `prod.ts` 当前可暂时与体验版同域；如果后续独立部署正式环境，再替换为独立生产域名。
- 微信公众平台 request 合法域名必须与小程序配置中的 API 域名一致。
- `urlCheck=false` 只适合本地调试。体验版、提审和正式发布前必须开启合法域名校验。

## 5. 发布前检查

1. API `/health` 返回 `ok: true` 且 `database: "ok"`。
2. 数据库迁移已执行。
3. 后台可以登录、查看赛事、发布赛事。
4. 至少 5 条真实赛事已人工核验并发布。
5. 小程序 `test` 或 `prod` API 域名指向真实 HTTPS 域名。
6. 微信公众平台 request 合法域名配置完成。
7. 线上 API 已设置 `NODE_ENV=production` 和强随机 `ADMIN_TOKEN_SECRET`。
8. 线上 API 未设置 `ALLOW_DEV_ADMIN=true`。
9. 默认 `admin/admin` 不再用于测试或正式环境。
