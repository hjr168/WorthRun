# 部署说明

本文是通用部署说明，不绑定具体云厂商。体验版和正式环境上线前，请先完成真实数据内测流程与体验版配置检查。

## 1. API 服务

- API 需要 Node.js 运行环境，并使用仓库根目录的 pnpm workspace 安装依赖。
- API 依赖 PostgreSQL 数据库，部署前需要创建数据库并执行迁移。
- `.env` 至少需要配置：
  - `DATABASE_URL`：PostgreSQL 连接串。
  - `API_PORT`：API 监听端口，例如 `4000`。
  - `ADMIN_TOKEN_SECRET`：后台登录 token 签名密钥，正式环境必须使用高强度随机值。
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
VITE_API_BASE_URL=https://your-api.example.com pnpm --filter @worth-running/admin build
```

## 4. 小程序配置

- 体验版使用 `apps/miniapp/config/test.ts`，正式版使用 `apps/miniapp/config/prod.ts`。
- `apps/miniapp/config/index.ts` 需要切换到对应配置。
- `test.ts` 和 `prod.ts` 必须替换为真实 HTTPS API，不能保留 `https://test-api.example.com` 或 `https://api.example.com`。
- 微信公众平台 request 合法域名必须与小程序配置中的 API 域名一致。
- `urlCheck=false` 只适合本地调试。体验版、提审和正式发布前必须开启合法域名校验。

## 5. 发布前检查

1. API `/health` 返回 `ok: true` 且 `database: "ok"`。
2. 数据库迁移已执行。
3. 后台可以登录、查看赛事、发布赛事。
4. 至少 5 条真实赛事已人工核验并发布。
5. 小程序 `test` 或 `prod` API 域名已经替换为真实 HTTPS 域名。
6. 微信公众平台 request 合法域名配置完成。
7. 默认 `admin/admin` 不再用于测试或正式环境。
