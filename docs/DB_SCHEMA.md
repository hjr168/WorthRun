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
- `event_candidates`：来源生成的候选赛事草稿，必须人工审核后才能写入 `events`。`source_external_id` 用于同一来源稳定去重，`raw_payload` 保留结构化来源记录，`extractor_version` 标记映射或提示词版本；`priority_score` 和 `review_issues` 用于后台审核排序。
- `event_source_runs`：记录每次手动或自动来源运行的状态、分页范围、处理数量和错误摘要，不保存 API key、网页正文或大段原始响应。
- `event_interactions`：按匿名用户 hash、赛事、动作和北京时间日期去重的轻量行为记录，仅保存详情访问与官方入口复制。

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

V0.4 赛事源运营自动化变更：

- `event_sources` 新增自动调度开关、运行间隔、低内存分页上限、下一页游标、下次运行时间、连续失败次数和数据库租约锁字段。
- 已有来源的 `schedule_enabled` 默认保持 `false`，迁移不会自动启动线上抓取。
- `event_source_runs` 保存 `manual` / `scheduled` 触发方式以及 `running` / `succeeded` / `failed` 状态，用于后台运行历史和失败排查。
- `event_candidates.review_issues` 仅使用 `missing_event_date`、`missing_official_url`、`missing_source_url`、`duplicate_event`；优先级由比赛日期确定，不调用模型打分。
- 中国田协来源默认每次 1 页、每页 20 条；应用层硬上限为 2 页 x 20 条，来源和候选按顺序处理以控制峰值内存。

V0.4.1 数据运营闭环变更：

- `event_source_runs` 新增 `skipped_expired` 和 `skipped_outside_region`，记录抓取过滤结果。
- `EventInteractionAction` 仅包含 `event_detail_view`、`official_link_copy`。
- `event_interactions` 不保存 IP 或明文匿名标识；唯一索引避免同一天重复计数。
- 公开赛事、候选采纳和赛事发布统一执行北京时间未来日期及大湾区 9+2 城市校验。
