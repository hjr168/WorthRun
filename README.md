# 哪场值得跑 V0.1

面向粤港澳大湾区跑者的跑步赛事决策工具。本仓库当前完成第一阶段：工程骨架、数据库结构、后台赛事管理基础版。

## 当前范围

- monorepo 工程骨架
- 共享状态枚举与类型
- PostgreSQL + Prisma schema
- 后台 API：赛事、反馈、操作日志、系统配置、工作台
- React + Vite 后台：工作台、赛事库、新增/编辑赛事、发布/隐藏/下架
- 5 条种子赛事数据

V0.1 第一阶段不接 AI、不做自动采集、不做分享卡片、不做投票、不做天气 API、不做社区和评论。

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

## 常用命令

```bash
pnpm dev:api
pnpm dev:admin
pnpm typecheck
pnpm build
pnpm format
```

## 合规文案

赛事信息提示：

> AI 整理，仅供参考，报名以官方为准。

官方入口统一文案：

> 前往官方确认
