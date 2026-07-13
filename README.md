# 哪场值得跑 V0.2

面向粤港澳大湾区跑者的跑步赛事决策工具。本仓库已完成 V0.1 核心闭环、V0.1 后台收口（系统设置/内容配置/操作日志/归档/角色化 UI/清单接口联动）和 V0.2 分享传播版（微信页面分享、赛事决策卡 Canvas 分享图、小程序码、分享数据统计）。

公开赛事发布仍坚持人工核验：AI 赛事源只生成后台候选草稿，不做自动发布，不做官方报名闭环。赛事信息统一提示：

> AI 整理，仅供参考，报名以官方为准。

官方入口统一文案：

> 前往官方确认

## 项目定位

哪场值得跑是跑步赛事信息整理与赛前决策参考工具，帮助用户查看公开赛事信息、收藏关注赛事、记录跑赛偏好，并在报名前前往官方渠道确认信息。

小程序已切换正式版配置，指向正式 HTTPS API，可提交微信审核。

## 当前已完成

- monorepo 工程骨架与共享类型。
- PostgreSQL + Prisma 数据结构、迁移和种子数据。
- 后端 API：赛事、偏好、收藏、反馈、清单模板、分享记录、后台管理。
- React + Vite 后台：工作台、赛事库、新增/编辑赛事、发布/隐藏/下架/归档、质量反馈、操作日志、系统设置、内容配置、分享数据统计。
- 后台登录与 Bearer token 鉴权，按角色矩阵控制操作权限。
- 小程序公开 API：赛事列表、赛事详情、偏好、收藏、反馈、清单模板、分享记录上报。
- 微信小程序页面：首页、赛事列表、赛事详情、偏好设置、我的、我的收藏、反馈、工具、配速计算器、赛前清单、分享卡片。
- 小程序 API baseUrl 配置化。
- 首页按用户偏好展示赛事，偏好无完全匹配时兜底展示近期赛事。
- 赛事列表分页加载。
- 赛事详情"前往官方确认"复制链接并弹窗说明。
- 偏好设置 chips 多选。
- 赛前清单从后端按距离类型读取，接口失败本地兜底。
- 真实赛事数据准备指南和 CSV 导入脚本。
- 真实赛事 CSV dry-run 校验、路径兼容和导入前新增/更新判断。
- 后台小程序发布前检查。
- 小程序内测检查清单和提审准备文档。
- 真实数据内测流程和体验版配置检查清单。
- 小程序正式版配置已指向真实 HTTPS API：`https://run-api.huangjiarong.top`，`apps/miniapp/config/index.ts` 当前指向 `prodConfig`。
- API 生产环境强制要求 `ADMIN_TOKEN_SECRET`，默认后台 fallback 仅允许显式本地开发开启。
- **V0.2 分享传播**：赛事详情页微信转发/朋友圈分享、赛事决策卡 Canvas 分享图（可保存到相册）、小程序码生成、分享数据统计页。
- **V0.1 后台收口**：系统设置页（合规文案/管理员管理）、内容配置页（城市/距离/标签/清单模板）、独立操作日志页、归档与恢复发布、按角色显隐操作按钮、枚举去重。
- **V0.3 AI 辅助赛事源**：后台支持页面 URL AI 抽取，以及中国田协公开赛事目录批量候选；结果只进入候选赛事，必须人工编辑、采纳为草稿后再核验发布。

## 目录说明

- `apps/api`：Express API 服务。
- `apps/admin`：后台管理页面。
- `apps/miniapp`：微信小程序。
- `packages/database`：Prisma schema、迁移、seed 和真实赛事 CSV 导入脚本。
- `packages/shared`：共享枚举、标签和类型。
- `docs`：数据库、API、种子数据、真实数据、内测和提审说明。

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

测试和正式环境必须重置默认管理员密码：

```bash
pnpm admin:reset-password -- admin "new-strong-password"
```

也可以直接运行数据库包脚本：

```bash
pnpm --filter @worth-running/database reset-admin-password admin "new-strong-password"
```

重置命令不会在控制台输出明文密码。

## 微信开发者工具打开方式

1. 先启动 API，确保 `http://localhost:4000/health` 可访问。
2. 打开微信开发者工具，选择“导入项目”。
3. 项目目录选择 `apps/miniapp`。
4. AppID 可使用测试号或微信开发者工具测试 AppID。
5. 本地联调时，可以临时在“详情 / 本地设置”中勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。

源码中的 `apps/miniapp/project.config.json` 当前已开启 `urlCheck=true`。`urlCheck=false` 只允许用于开发调试。体验版、提审和正式发布前必须开启合法域名校验，并确保请求域名已经在微信公众平台配置。

## 小程序 API 配置

小程序 API 地址集中在 `apps/miniapp/config/`：

- `dev.ts`：本地开发，默认 `http://localhost:4000`。
- `test.ts`：体验版 / 测试环境，为 `https://run-api.huangjiarong.top`，已经不是占位域名。
- `prod.ts`：正式环境，当前为 `https://run-api.huangjiarong.top`；如果后续独立部署正式环境，再替换为独立生产域名。
- `index.ts`：当前启用的环境，正式版阶段指向 `prodConfig`。

当前正式版启用配置：

```ts
import { prodConfig } from './prod';

export const config = prodConfig;
```

如需回退到体验版联调，修改 `apps/miniapp/config/index.ts`：

```ts
import { testConfig } from './test';

export const config = testConfig;
```

不要在页面文件或请求工具文件里硬编码 API 地址。

## API 运行环境与安全配置

本地开发可以使用默认 dev secret。线上 API 必须设置：

- `NODE_ENV=production`
- `ADMIN_TOKEN_SECRET`：强随机后台 token 签名密钥，不能为空，不能提交到代码仓库。

可选配置：

- `CORS_ORIGINS`：后台管理站点浏览器跨域白名单，多个域名用英文逗号分隔，例如 `https://admin.huangjiarong.top,https://ops.huangjiarong.top`。未携带 `Origin` 的小程序请求不依赖浏览器 CORS；本地非生产环境默认允许 `localhost`、loopback 和私有局域网 IP（如 `192.168.x.x`）。
- `ALLOW_DEV_ADMIN=true`：仅本地开发调试时允许无 token 使用默认 `seed-admin / super_admin`。测试、体验版和正式环境禁止设置为 `true`。
- `WX_APPID` / `WX_APPSECRET`：小程序 AppID 和 AppSecret，用于生成赛事决策卡分享图上的小程序码（`/api/wxacode`）。从微信公众平台「开发管理 → 开发设置」获取。未配置时小程序码接口返回 503，分享图自动降级为占位提示，不阻塞其他功能。
- `AI_INGEST_PROVIDER`：页面 URL 赛事源使用的模型提供方，支持 `glm`、`deepseek` 和 `openai`；本项目推荐先用 `glm`，也可切到 `deepseek` 测试。中国田协目录为结构化映射，不需要 AI Key。
- `ZHIPUAI_API_KEY` / `GLM_API_KEY` / `AI_INGEST_API_KEY`：`AI_INGEST_PROVIDER=glm` 时调用 GLM 抽取所需。未配置时，赛事源可保存，但手动抓取会返回错误并在后台记录失败状态。
- `DEEPSEEK_API_KEY` / `AI_INGEST_API_KEY`：`AI_INGEST_PROVIDER=deepseek` 时调用 DeepSeek 抽取所需。默认模型为 `deepseek-v4-flash`，DeepSeek 官方说明旧模型名 `deepseek-chat` / `deepseek-reasoner` 将于 2026-07-24 废弃，不建议新接入使用。
- `OPENAI_API_KEY` / `AI_INGEST_API_KEY`：`AI_INGEST_PROVIDER=openai` 时调用 OpenAI 抽取所需。
- `AI_INGEST_MODEL`：AI 结构化抽取模型；留空时按 provider 使用默认值：GLM 为 `glm-5.2`，DeepSeek 为 `deepseek-v4-flash`，OpenAI 为 `gpt-5.5`。
- `AI_INGEST_BASE_URL`：兼容 OpenAI SDK 的模型服务地址；留空时按 provider 使用默认值：GLM 为 `https://open.bigmodel.cn/api/paas/v4/`，DeepSeek 为 `https://api.deepseek.com`。
- `AI_INGEST_USER_AGENT`：抓取来源页使用的 User-Agent，默认 `WorthRunBot/0.1`。上线前建议改成带联系方式的标识。

中国田协赛事目录适配器每次最多读取 20 条。该目录只证明赛事记录来源，不代表官方报名入口；管理员仍需人工核验并补充 `officialUrl` 和报名状态。重复抓取只更新待审核候选，不覆盖已采纳或已驳回结果。

生产环境缺少 `ADMIN_TOKEN_SECRET` 时 API 会直接启动失败，避免使用开发密钥上线。

本地如需临时跳过后台登录鉴权，可显式开启：

```bash
ALLOW_DEV_ADMIN=true pnpm dev:api
```

## 真机调试说明

开发者工具本地调试可使用 `localhost`。真机预览时，`localhost` 指向手机本机，不能访问电脑服务。需要把 `dev.ts` 中的 `apiBaseUrl` 临时改成电脑局域网 IP，例如：

```ts
export const devConfig = {
  apiBaseUrl: 'http://192.168.1.23:4000',
};
```

电脑和手机需连接同一 Wi-Fi，并确认防火墙允许访问 4000 端口。

## 正式版 / 提审 HTTPS 域名

正式版和提审前必须完成：

- API 部署到 HTTPS 域名。
- 当前正式版 API 为 `https://run-api.huangjiarong.top`。
- 在微信公众平台配置 request 合法域名：`https://run-api.huangjiarong.top`。
- 正式版阶段 `apps/miniapp/config/index.ts` 指向 `prodConfig`。
- 体验版联调时使用 `testConfig`，正式发布使用 `prodConfig`；当前两者同域，正式环境如后续独立部署再替换 `prod.ts`。
- 不使用 `localhost`、局域网 IP 或 HTTP 地址提审。
- `test.ts` 已经不是占位域名，不要改回旧的测试占位域名。
- `prod.ts` 当前可暂时同域，不要改回旧的正式占位域名。
- `urlCheck=false` 只允许开发调试，体验版上传和正式提审前必须开启合法域名校验。
- 线上 API 必须设置 `NODE_ENV=production` 和强随机 `ADMIN_TOKEN_SECRET`。
- 测试、体验版和正式环境禁止 `ALLOW_DEV_ADMIN=true`。
- 正式版发布前检查清单见 `docs/PRODUCTION_RELEASE_CHECKLIST.md`。
- 测试环境部署可参考 `docs/TEST_ENV_SETUP.md`。
- 隐私政策草稿可参考 `docs/PRIVACY_POLICY_DRAFT.md`，正式发布前需要人工确认主体信息和联系方式。

## 真实赛事数据准备

真实赛事数据应先人工核验，再导入后台。参考：

- `docs/REAL_EVENT_DATA_GUIDE.md`
- `docs/seed-events-template.csv`
- `docs/real-events-template.csv`

`docs/real-events-template.csv` 是待填写模板，不可直接导入。请复制为 `docs/real-events.local.csv`，填入人工核验后的真实赛事日期、官方入口和来源信息，再运行导入脚本。CSV 字段与 `docs/seed-events-template.csv` 保持一致。列表字段使用 `|` 分隔，例如 `10K|半马`。不要编造官方链接；来源不确定时保持待核实，不要把占位域名当作真实来源。

`docs/real-events.local.csv` 用于本地真实赛事数据录入，包含人工核验链接，不建议提交到仓库，且已在 `.gitignore` 中忽略。真实数据导入前必须人工核验赛事名称、城市、比赛日期、距离项目、官方入口、来源名称、来源链接和来源等级。

## 真实赛事 CSV 导入

导入脚本位置：

```text
packages/database/scripts/import-events-from-csv.ts
```

从根目录运行：

```bash
pnpm db:import-events -- ./docs/real-events.local.csv
```

也可以直接运行 database 包脚本：

```bash
pnpm --filter @worth-running/database db:import-events ../../docs/real-events.local.csv
```

真实导入前先运行 dry-run：

```bash
pnpm db:import-events -- ./docs/real-events.local.csv --dry-run
```

dry-run 需要数据库可连接，因为脚本会根据数据库中已有的 `eventName + city + eventDate` 判断每行将新增还是将更新。运行 dry-run 前请先启动 PostgreSQL、配置 `.env` 中的 `DATABASE_URL`，并执行数据库迁移。

导入规则：

- 按 `eventName + city + eventDate` 判断是否已存在。
- `--dry-run` 只校验 CSV 和判断将新增/将更新/失败行，不写入数据库。
- 不存在则创建赛事，默认 `publishStatus=draft`。
- 已存在则更新赛事字段，删除并重建报名前确认清单和 eventTags，保留原 `publishStatus`。
- `officialUrl` 必须是合法 URL，且不能包含 `example.com`。
- `sourceUrl` 可留空；填写时必须是合法 URL。
- 导入后写入 `admin_operation_logs`。
- 导入不会自动发布，发布仍需在后台人工确认。

## 常用命令

```bash
pnpm dev:api
pnpm dev:admin
pnpm typecheck
pnpm build
pnpm format
pnpm admin:reset-password -- admin "new-strong-password"
pnpm db:import-events -- ./docs/real-events.local.csv --dry-run
pnpm db:import-events -- ./docs/real-events.local.csv
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
  -d '{"eventId":"<published-event-id>","userKey":"demo-user","requestId":"feedback_demo_request_001","feedbackType":"日期有误","content":"报名截止时间可能有误"}'
```

## 小程序当前功能

- 首页根据偏好优先展示赛事：先按第一个城市和第一个距离筛选，无完全匹配时先按城市兜底，再展示全部近期赛事。
- 首页无偏好时展示全部近期赛事。
- 赛事列表筛选：城市、距离、报名状态、跑前判断、搜索。
- 赛事列表触底分页加载。
- 赛事详情：跑前判断、基础信息、适合/不适合人群、报名前确认清单、合规提示。
- "前往官方确认"：复制官方链接，并弹窗说明小程序暂不直接跳转外部链接。
- 收藏 / 取消收藏。
- 我的收藏。
- 偏好设置：城市、距离、关注点 chips 多选，支持保存、重置、跳过。
- 反馈纠错。
- 工具页。
- 配速计算器。
- 赛前清单：通用、5K、10K、半马、全马，从后端按距离类型读取模板，接口失败本地兜底。
- 赛事详情页微信转发给朋友 / 分享到朋友圈，分享标题自动生成"这场值得跑吗？{赛事名称}"。
- 赛事决策卡分享图：详情页点"分享图"进入，Canvas 绘制含品牌头/赛事名/城市日期距离/报名状态胶囊/跑者标签/跑者摘要/小程序码/合规提示，可保存到相册或分享给好友。

## 明确未做

- AI 自动采集。
- AI 自动解析。
- 自动发布。
- 我的选择卡。
- 想跑 / 观望 / 跑过投票。
- 天气 API。
- 赛事对比。
- 评论区。
- 跑团社区。
- 用户关注 / 私信。
- 官方报名闭环。
- 勋章、积分、排行榜。
- 用户发帖。

## 内测验收建议

内测前建议完成：

1. 后台录入至少 10 条真实赛事。
2. 后台发布至少 5 条赛事。
3. 每条已发布赛事都有官方入口、来源名称、跑前判断、判断理由和确认清单。
4. 运行 `pnpm typecheck`。
5. 运行 `pnpm build`。
6. 打开微信开发者工具导入 `apps/miniapp`。
7. 按 `docs/MINIAPP_INTERNAL_TEST_CHECKLIST.md` 逐项检查首页、列表、详情、收藏、偏好、反馈、工具和清单。

## 小程序提审准备

提审前参考 `docs/MINIAPP_REVIEW_PREP.md`，人工准备：

- 微信公众平台服务类目确认。
- HTTPS API 域名和 request 合法域名配置。
- 隐私政策。
- 用户数据用途说明。
- 反馈内容处理说明。
- 收藏和偏好数据说明。
- 联系方式或数据删除方式。
- 首页、赛事列表、赛事详情、合规提示、前往官方确认弹窗、偏好、收藏、反馈、赛前清单、配速计算器截图。

## 常见问题

### 小程序里请求失败怎么办？

先确认 API 是否启动：`http://localhost:4000/health`。开发者工具本地调试可使用 `localhost`，真机调试必须改成电脑局域网 IP。

### 真机调试为什么不能访问 localhost？

手机里的 `localhost` 是手机本机，不是电脑。请在 `apps/miniapp/config/dev.ts` 中改为电脑局域网 IP，例如 `http://192.168.1.23:4000`。

### 体验版或提审为什么不能用 HTTP？

微信体验版和提审需要配置 HTTPS request 合法域名。本地 HTTP 和局域网 IP 只适合开发调试。

### 后台登录失败怎么办？

确认已执行 `pnpm db:seed`。默认账号为 `admin / admin`。

### 小程序没有赛事怎么办？

后台需要至少发布 1 场赛事。未发布、隐藏或下架赛事不会出现在公开 API。

### 真实赛事 CSV 导入失败怎么办？

检查 CSV 表头是否与模板一致，`eventDate` 是否为 `YYYY-MM-DD`，枚举值是否正确，`officialUrl` 是否为真实合法 URL，且没有使用 `example.com`。
