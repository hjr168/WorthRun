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
