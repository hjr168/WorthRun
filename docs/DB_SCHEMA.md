# 数据库结构

V0.1 使用 PostgreSQL + Prisma。

核心表：

- `events`：赛事主表，包含报名状态、发布状态、信息状态、跑前判断、来源和字段可信度。
- `event_checklist_items`：报名确认清单。
- `event_tags`：赛事标签。
- `user_preferences`：匿名用户或 openid 偏好预留。
- `user_favorites`：收藏赛事。
- `feedback`：纠错反馈。
- `admin_users`：后台管理员，V0.1 保留角色字段。
- `admin_operation_logs`：后台关键操作日志。
- `system_configs`：基础配置。

发布状态、信息状态、跑前判断、报名状态、来源等级等枚举同时定义在 Prisma schema 和 `packages/shared`。

第二阶段变更：

- 新增 Prisma enum `SourceLevel`：`official`、`trusted`、`secondary`、`unknown`。
- `events.source_level` 从字符串改为 `SourceLevel` enum。
- `admin_users.password_hash` 继续用于后台登录密码 hash，不存储明文密码。
