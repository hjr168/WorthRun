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
- `event_sources`：AI 辅助入库的数据源配置，只由后台管理员维护；当前可执行 `page_url` 和固定 `chinaath_api`。
- `event_candidates`：来源生成的候选赛事草稿，必须人工审核后才能写入 `events`。`source_external_id` 用于同一来源稳定去重，`raw_payload` 保留结构化来源记录，`extractor_version` 标记映射或提示词版本。

发布状态、信息状态、跑前判断、报名状态、来源等级等枚举同时定义在 Prisma schema 和 `packages/shared`。

第二阶段变更：

- 新增 Prisma enum `SourceLevel`：`official`、`trusted`、`secondary`、`unknown`。
- `events.source_level` 从字符串改为 `SourceLevel` enum。
- `admin_users.password_hash` 继续用于后台登录密码 hash，不存储明文密码。

V0.3.1 批量赛事源变更：

- `EventSourceType` 新增 `chinaath_api`。
- `event_candidates` 新增 `source_external_id`、`raw_payload`、`extractor_version`。
- `(source_id, source_external_id)` 唯一索引用于重复抓取时更新待审核候选。
- 已采纳、已驳回或已合并候选不会被后续来源运行覆盖。
