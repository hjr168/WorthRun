# 数据库结构

V0.1 使用 PostgreSQL + Prisma。

核心表：

- `events`：赛事主表，包含报名状态、发布状态、信息状态、跑前判断、来源和字段可信度。
- `event_checklist_items`：报名确认清单。
- `event_tags`：赛事标签。
- `user_preferences`：匿名用户或 openid 偏好预留。
- `user_favorites`：收藏赛事。
- `feedback`：赛事纠错和产品反馈，使用范围字段区分，只保存必要页面上下文。
- `api_error_metrics`：小时级 5xx 聚合，只保存路由组、错误类别和数量。
- `admin_users`：后台管理员，V0.1 保留角色字段。
- `admin_operation_logs`：后台关键操作日志。
- `system_configs`：基础配置。
- `event_sources`：AI 辅助入库的数据源配置，只由后台管理员维护；当前可执行 `page_url`、`chinaath_api`、`world_athletics` 和 `chinamarathon_sitemap`。
- `event_candidates`：来源生成的候选赛事草稿，必须人工审核后才能写入 `events`。`source_external_id` 用于同一来源稳定去重，`raw_payload` 保留结构化来源记录，`extractor_version` 标记映射或提示词版本；`priority_score` 和 `review_issues` 用于后台审核排序。
- `event_source_runs`：记录每次手动或自动来源运行的状态、分页范围、处理数量和错误摘要，不保存 API key、网页正文或大段原始响应。
- `event_interactions`：按匿名用户 hash、赛事、动作和北京时间日期去重的轻量行为记录，保存详情访问、官方入口复制和来源摘要相关行为。
- `event_change_alerts`：官方或可信来源再次命中已采纳候选时生成的赛事变更告警，保存可比较字段快照、有限证据、来源和人工处理状态，不自动修改公开赛事。
- `user_event_choices`：匿名用户对单场赛事的“想跑 / 观望 / 已报名”互斥选择；公开端只聚合数量，不返回参与者列表。
- `event_source_summaries`：来源摘要的草稿、已发布和已取代版本，只保存摘要、来源元数据和内容哈希，不保存完整网页正文或截图。

发布状态、信息状态、跑前判断、报名状态、来源等级等枚举同时定义在 Prisma schema 和 `packages/shared`。

第二阶段变更：

- 新增 Prisma enum `SourceLevel`：`official`、`trusted`、`community`、`secondary`、`unknown`。
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
- `event_candidates.review_issues` 使用 `missing_event_date`、`missing_official_url`、`missing_source_url`、`duplicate_event`、`source_date_conflict`；优先级由比赛日期确定，不调用模型打分。
- 中国田协来源默认每次 1 页、每页 20 条；应用层硬上限为 2 页 x 20 条，来源和候选按顺序处理以控制峰值内存。

V0.4.1 数据运营闭环变更：

- `event_source_runs` 新增 `skipped_expired` 和 `skipped_outside_region`，记录抓取过滤结果。
- V0.4.1 初始行为枚举包含 `event_detail_view`、`official_link_copy`；V0.5.0 在此基础上增加来源摘要相关行为。
- `event_interactions` 不保存 IP 或明文匿名标识；唯一索引避免同一天重复计数。
- 公开赛事、候选采纳和赛事发布统一执行北京时间未来日期及大湾区 9+2 城市校验。

V0.4.2 多赛事源变更：

- `EventSourceType` 新增 `world_athletics`、`chinamarathon_sitemap`；`SourceLevel` 新增 `community`。
- 中国田协来源改为一源一城，生产初始化为 9 个大湾区内地城市来源。
- 年度计划导入使用暂停的审计来源和稳定 `source_external_id`，不会创建已发布赛事。

V0.4.3 候选发布闭环变更：

- `event_sources.source_level` 保存来源可信等级，固定官方来源由服务端维护，社区发现源固定为 `community`。
- `event_candidates.merged_into_candidate_id` 自关联主候选；被归并记录使用 `merged` 状态并永久保留证据和操作日志。
- 候选采纳仍只创建 `draft`，并按距离读取 `checklist_templates`；没有匹配项时使用通用清单。
- 批量采纳和发布每批最多 20 条，应用时校验预览返回的 `updated_at`，单条失败不回滚其他合格记录。

V0.4.5 赛事变更监测变更：

- `events.source_checked_at` 记录官方或可信来源最近一次重新检查时间；它与赛事业务字段的 `updated_at` 分离。
- `event_source_runs` 新增 `change_alerts_created` 和 `change_alerts_existing`，区分本次新建与已存在的去重告警。
- `event_change_alerts` 使用 `(event_id, source_id, fingerprint)` 唯一约束，同一规范化差异不会重复创建；状态包含开放、已应用、已忽略、赛事已归档和已被后续处理取代。
- 告警快照只保存关键可比较字段和最多 10 条证据。只有管理员显式确认后才能应用日期、距离、报名状态、截止时间或官方入口变更。

V0.5.0 匿名选择与来源摘要变更：

- `user_event_choices` 使用 `(user_key, event_id)` 唯一约束，切换选择通过 upsert 完成，公开数量按 `(event_id, choice)` 索引实时聚合。
- `EventInteractionAction` 增加来源摘要打开、成功查看和原始来源链接复制，不保存明文匿名标识。
- `event_source_summaries` 使用 `(event_id, content_hash, prompt_version)` 去重；AI 只生成草稿，人工发布新版本时旧版本改为 `superseded`。
- 官方来源产生新的开放变更告警时，当前已发布摘要标记为 stale，但不会被自动覆盖。

V0.5.1 产品反馈与稳定性变更：

- `FeedbackScope` 区分 `event_correction` 与 `product_feedback`；旧记录默认回填为赛事纠错，不改变状态。
- 产品反馈可保存固定 `context_page`、最长 32 字符的 `app_version` 和关联服务端请求编号，不保存截图、设备信息或联系方式。
- `api_error_metrics` 按小时、固定路由组和错误类别聚合 5xx，30 天后由现有反馈维护任务清理。
