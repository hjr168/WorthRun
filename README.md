# 哪场值得跑 V0.1

面向粤港澳大湾区跑者的跑步赛事决策工具。本仓库已完成第三阶段小程序核心闭环：后端 API、后台赛事管理、后台登录鉴权、质量反馈、小程序公开 API，以及微信小程序 V0.1 体验页面。

V0.1 仍坚持人工维护赛事信息：不接 AI 自动采集、不做自动发布、不做官方报名闭环。赛事信息统一提示：

> AI 整理，仅供参考，报名以官方为准。

官方入口统一文案：

> 前往官方确认

## 当前已完成

- monorepo 工程骨架与共享类型
- PostgreSQL + Prisma 数据结构与种子数据
- 后端 API：赛事、偏好、收藏、反馈、清单模板、后台管理
- React + Vite 后台：工作台、赛事库、新增/编辑赛事、发布/隐藏/下架、质量反馈
- 后台登录与 Bearer token 鉴权
- 小程序公开 API：赛事列表、赛事详情、偏好、收藏、反馈
- 微信小程序核心闭环：`apps/miniapp`
- 小程序页面：首页、赛事列表、赛事详情、偏好设置、我的、我的收藏、反馈、工具、配速计算器、赛前清单
- 小程序 API baseUrl 配置化
- 真实赛事数据准备指南：`docs/REAL_EVENT_DATA_GUIDE.md`

## 目录说明

- `apps/api`：Express API 服务
- `apps/admin`：后台管理页面
- `apps/miniapp`：微信小程序
- `packages/database`：Prisma schema、迁移和 seed
- `packages/shared`：共享枚举、标签和类型
- `docs`：数据库、API、种子数据和真实数据导入说明

## 本地启动

```bash
pnpm install
cp .env.example .env
docker compose -p worth-running up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

本地地址：

- 管理后台：http://localhost:5173
- API 健康检查：http://localhost:4000/health

默认后台账号：

- 用户名：`admin`
- 密码：`admin`

该密码由 seed 脚本写入 PBKDF2 hash，不以明文存储。

## 微信开发者工具打开方式

1. 先启动 API，确保 `http://localhost:4000/health` 可访问。
2. 打开微信开发者工具，选择“导入项目”。
3. 项目目录选择 `apps/miniapp`。
4. AppID 可使用测试号或微信开发者工具测试 AppID。
5. 本地联调时，在“详情 / 本地设置”中勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。

## 小程序 API 配置

小程序 API 地址集中在：

```text
apps/miniapp/config/index.ts
```

默认配置：

```ts
export const config = {
  apiBaseUrl: 'http://localhost:4000',
};
```

不要在页面或请求文件里重复硬编码 API 地址。

真机调试时，`localhost` 指向手机本机，不能访问电脑服务。需要把 `apiBaseUrl` 改成电脑局域网 IP，例如：

```ts
export const config = {
  apiBaseUrl: 'http://192.168.1.23:4000',
};
```

电脑和手机需连接同一 Wi-Fi，并确认防火墙允许访问 4000 端口。

体验版 / 提审前需要 HTTPS 域名：

- API 必须部署到 HTTPS 域名；
- 在微信公众平台配置 request 合法域名；
- 小程序 `apiBaseUrl` 改为 HTTPS 地址；
- 不要使用 `localhost`、局域网 IP 或 HTTP 地址提审。

后续可按环境拆分配置，例如：

- `config/dev.ts`：本地调试；
- `config/test.ts`：体验版；
- `config/prod.ts`：正式环境。

## 常用命令

```bash
pnpm dev:api
pnpm dev:admin
pnpm typecheck
pnpm build
pnpm format
```

## API 调试示例

登录后台：

```bash
curl -s http://localhost:4000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

公开赛事列表：

```bash
curl -s "http://localhost:4000/api/events?page=1&pageSize=10"
```

提交用户偏好：

```bash
curl -s http://localhost:4000/api/preferences \
  -H "Content-Type: application/json" \
  -d '{"userKey":"demo-user","cities":["广州","深圳"],"distances":["10K","半马"],"focusTags":["新手友好"]}'
```

提交结构化反馈：

```bash
curl -s http://localhost:4000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"eventId":"<published-event-id>","userKey":"demo-user","feedbackType":"info_error","content":"报名截止时间可能有误"}'
```

## 小程序当前功能

- 首页根据偏好优先展示赛事：取第一个城市、距离筛选；无偏好时展示全部近期赛事
- 赛事列表筛选：城市、距离、报名状态、跑前判断、搜索
- 赛事列表触底分页加载
- 赛事详情：跑前判断、基础信息、适合/不适合人群、报名前确认清单、合规提示
- “前往官方确认”：复制官方链接，并弹窗说明小程序暂不直接跳转外部链接
- 收藏 / 取消收藏
- 我的收藏
- 偏好设置：城市、距离、关注点 chips 多选，支持保存、重置、跳过
- 反馈纠错
- 工具页
- 配速计算器
- 赛前清单：通用、5K、10K、半马、全马本地分组清单

## 明确未做

- AI 自动采集
- AI 自动解析
- 自动发布
- 分享卡片生成
- 我的选择卡
- 想跑 / 观望 / 跑过投票
- 天气 API
- 赛事对比
- 评论区
- 跑团社区
- 用户关注 / 私信
- 官方报名闭环

## 常见问题

### 小程序里请求失败怎么办？

先确认 API 是否启动：`http://localhost:4000/health`。开发者工具本地调试可使用 `localhost`，真机调试必须改成电脑局域网 IP。

### 真机调试为什么不能访问 localhost？

手机里的 `localhost` 是手机本机，不是电脑。请在 `apps/miniapp/config/index.ts` 中改为电脑局域网 IP，例如 `http://192.168.1.23:4000`。

### 体验版或提审为什么不能用 HTTP？

微信体验版和提审需要配置 HTTPS request 合法域名。本地 HTTP 和局域网 IP 只适合开发调试。

### 后台登录失败怎么办？

确认已执行 `pnpm db:seed`。默认账号为 `admin / admin`。

### 小程序没有赛事怎么办？

后台需要至少发布 1 场赛事。未发布、隐藏或下架赛事不会出现在公开 API。

### 真实赛事数据怎么准备？

参考 `docs/REAL_EVENT_DATA_GUIDE.md`。不要编造真实赛事链接；来源不确定时保持 `unknown` 或待核实。

## 验收建议

1. `pnpm typecheck`
2. `pnpm build`
3. 打开微信开发者工具导入 `apps/miniapp`
4. 发布至少 1 条后台赛事后检查首页、列表、详情、收藏、反馈、偏好和清单
