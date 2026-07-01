# 哪场值得跑 V0.1

面向粤港澳大湾区跑者的跑步赛事决策工具。本仓库当前完成第一阶段与第二阶段基础加固：工程骨架、数据库结构、后台赛事管理、登录鉴权、反馈处理、公开小程序 API 准备。

## 当前范围

- monorepo 工程骨架
- 共享状态枚举与类型
- PostgreSQL + Prisma schema
- 后台 API：赛事、反馈、操作日志、系统配置、工作台
- React + Vite 后台：工作台、赛事库、新增/编辑赛事、发布/隐藏/下架
- 5 条种子赛事数据
- 后台登录与 Bearer token 鉴权
- 质量与反馈页面
- 报名前确认清单手动编辑
- 小程序公开 API：赛事、偏好、收藏、反馈、清单模板
- 微信小程序 V0.1 核心闭环：首页、赛事列表、赛事详情、收藏、反馈、我的收藏、偏好设置、工具页

V0.1 当前阶段不接 AI、不做自动采集、不做分享卡片、不做投票、不做天气 API、不做社区和评论。

## 本地启动

1. 安装依赖

```bash
pnpm install
```

2. 准备环境变量

```bash
cp .env.example .env
```

3. 启动 PostgreSQL

```bash
docker compose -p worth-running up -d postgres
```

4. 生成 Prisma Client 并迁移数据库

```bash
pnpm db:generate
pnpm db:migrate
```

5. 导入种子数据

```bash
pnpm db:seed
```

6. 启动后端和后台

```bash
pnpm dev
```

后台访问：

- 管理后台：http://localhost:5173
- API 健康检查：http://localhost:4000/health

小程序本地预览：

1. 先启动 API，确保 `http://localhost:4000/health` 可访问。
2. 在微信开发者工具中选择“导入项目”。
3. 项目目录选择 `apps/miniapp`。
4. AppID 可使用测试号或微信开发者工具提供的测试 AppID。
5. 本地联调时在“详情 / 本地设置”中勾选不校验合法域名。

小程序 API base URL 在 `apps/miniapp/app.ts` 的 `globalData.apiBaseUrl` 配置，默认是 `http://localhost:4000`。

默认开发账号：

- 用户名：`admin`
- 密码：`admin`

该密码由 seed 脚本写入 PBKDF2 hash，不以明文存储。

## 常用命令

```bash
pnpm dev:api
pnpm dev:admin
pnpm typecheck
pnpm build
pnpm format
```

## 第二阶段 API 验证

登录后台：

```bash
curl -s http://localhost:4000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

公开赛事列表只返回已发布赛事：

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

清单模板：

```bash
curl -s http://localhost:4000/api/checklist/templates
```

## 小程序功能验证

1. 首页加载公开赛事：先在后台发布至少 1 场赛事，再打开小程序首页。
2. 赛事列表筛选：切换城市、距离、报名状态、跑前判断，确认请求结果刷新。
3. 详情页：从首页或列表进入，确认跑前判断、基础信息、清单、合规提示和底部操作栏展示。
4. 收藏：点击收藏后进入“我的 / 我的收藏”，确认赛事出现在收藏列表；再次取消收藏后列表移除。
5. 偏好：进入“我的 / 偏好设置”，保存城市、距离、关注点，返回后偏好摘要更新。
6. 反馈：详情页点击“反馈纠错”，提交后可在后台反馈页面看到记录。
7. 工具：进入配速计算器和赛前清单，确认本地计算与清单展示可用。

## 明确未做

- AI 自动采集 / 解析
- 自动发布
- 来源健康度
- 分享卡片
- 投票、跑过标签、评论区、社区
- 天气 API
- 赛事对比
- 官方报名闭环

## 合规文案

赛事信息提示：

> AI 整理，仅供参考，报名以官方为准。

官方入口统一文案：

> 前往官方确认
