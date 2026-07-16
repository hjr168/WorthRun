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
  - `FEEDBACK_ABUSE_SECRET`：反馈防刷与 IP 摘要使用的独立 HMAC 密钥，正式环境必须配置高强度随机值，不能写入代码或日志。
  - `CORS_ORIGINS`：后台管理站点浏览器跨域白名单，多个域名用英文逗号分隔。
  - `AI_INGEST_PROVIDER`：后台 AI 赛事源抽取模型提供方，支持 `glm`、`deepseek` 和 `openai`；推荐先用 `glm`，也可切到 `deepseek` 测试。
  - `ZHIPUAI_API_KEY` / `GLM_API_KEY` / `AI_INGEST_API_KEY`：`AI_INGEST_PROVIDER=glm` 时调用 GLM 抽取所需；不配置时不影响普通赛事 API，但手动抓取会失败。
  - `DEEPSEEK_API_KEY` / `AI_INGEST_API_KEY`：`AI_INGEST_PROVIDER=deepseek` 时调用 DeepSeek 抽取所需；默认模型为 `deepseek-v4-flash`，DeepSeek 官方说明旧模型名 `deepseek-chat` / `deepseek-reasoner` 将于 2026-07-24 废弃，不建议新接入使用。
  - `OPENAI_API_KEY` / `AI_INGEST_API_KEY`：`AI_INGEST_PROVIDER=openai` 时调用 OpenAI 抽取所需。
  - `AI_INGEST_MODEL`：AI 赛事源结构化抽取模型；留空时按 provider 使用默认值：GLM 为 `glm-5.2`，DeepSeek 为 `deepseek-v4-flash`，OpenAI 为 `gpt-5.5`。
  - `AI_INGEST_BASE_URL`：兼容 OpenAI SDK 的模型服务地址；留空时按 provider 使用默认值：GLM 为 `https://open.bigmodel.cn/api/paas/v4/`，DeepSeek 为 `https://api.deepseek.com`。
  - `AI_INGEST_USER_AGENT`：抓取来源页使用的 User-Agent，建议使用可联系到运营方的标识。
  - `EVENT_SOURCE_MIN_AVAILABLE_MB`：一次性赛事源任务启动所需最低可用内存，默认 256MB。
- `chinaath_api` 来源使用固定的中国田协公开赛事目录，不需要 AI Key；每次最多读取 20 条，并只生成后台候选。该接口是当前观察到的公开接口，不是承诺稳定的开放平台契约，响应结构变化时适配器会明确失败并记录状态。
- 中国田协目录不提供可直接采信的赛事官方报名入口；运营人员必须人工补充并核验 `officialUrl` 和报名状态后才能采纳为赛事草稿。
- 测试、体验版和正式环境禁止设置 `ALLOW_DEV_ADMIN=true`。
- API 对外访问需要 HTTPS 域名，体验版和提审不能使用 `localhost`、局域网 IP 或 HTTP。
- API 保持 `HOST=127.0.0.1`，仅由单层 Nginx 反向代理公开；Nginx 必须传递 `X-Forwarded-For` 与 `X-Forwarded-Proto`，不要把 API 端口直接暴露到公网。
- 每日执行一次 `pnpm feedback:maintenance`，清理过期反馈指纹、48 小时以前的限流摘要和 90 天以前的拦截聚合计数。该任务不会删除反馈正文或操作日志，Node heap 上限为 96MB。
- Nginx 使用仓库 `ops/nginx/worth-running.conf`；仅 `/api/feedback` 使用 16KB 请求体上限和每 IP 每分钟 6 次、burst 3 的限流，其他公开和后台接口不受影响。
- 生产 `DATABASE_URL` 建议追加 `connection_limit=2&pool_timeout=10`，降低 API 与短时赛事源任务并存时的数据库连接内存。

常用命令：

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm --filter @worth-running/api build
pnpm --filter @worth-running/api start
```

不足 1GB 运行内存的服务器使用仓库根目录 `ecosystem.config.cjs` 启动 API。赛事源自动运行不增加第二个 PM2 进程，而由系统 cron 启动一次性任务：

```bash
pm2 startOrReload ecosystem.config.cjs --only worth-running-api --env production --update-env
pm2 save
```

具体 crontab、日志轮转、资源验收和失败恢复见 `docs/EVENT_SOURCE_OPERATIONS.md`。完成目标服务器资源验收前，不要开启来源的自动运行。

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
10. 线上已配置 `FEEDBACK_ABUSE_SECRET`，并验证 `POST /api/feedback` 在重复提交时返回已有结果、频繁提交时返回 HTTP 429。
