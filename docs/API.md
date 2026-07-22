# API

## 后台赛事

- `GET /api/admin/events`
- `POST /api/admin/events`
- `GET /api/admin/events/:id`
- `PUT /api/admin/events/:id`
- `PATCH /api/admin/events/:id/publish`
- `PATCH /api/admin/events/:id/hide`
- `PATCH /api/admin/events/:id/offline`
- `PATCH /api/admin/events/:id/archive`

发布接口会校验必填字段和禁止关键词。隐藏、下架、归档等危险操作由后台页面二次确认，并写入操作日志。

## 后台登录

- `POST /api/admin/auth/login`
- `GET /api/admin/auth/me`

登录成功后返回 `token`。后台请求使用：

```text
Authorization: Bearer <token>
```

## 反馈

- `GET /api/admin/feedback`
- `GET /api/admin/feedback/:id`
- `PATCH /api/admin/feedback/:id/handle`
- `GET /api/admin/feedback/duplicates?hours=24`：查看待处理/处理中重复组。
- `POST /api/admin/feedback/duplicates/reject`：批量驳回重复组中的待处理记录。
- `GET /api/admin/feedback/summary`：分别返回赛事纠错、产品反馈和近 7/30 天提交量。
- `GET /api/admin/system-health`：返回 API RSS、数据库延迟、近 24 小时/7 天 5xx 聚合和最近来源运行状态。

## 操作日志

- `GET /api/admin/operation-logs`

支持 `targetType`、`targetId` 查询。

## 系统配置

- `GET /api/admin/system-configs`
- `PUT /api/admin/system-configs/:key`

## 分享中心与版本更新

- `GET /api/admin/share-settings`：读取强类型全局分享模板和允许的图片域名。
- `PUT /api/admin/share-settings`：超级管理员更新全局场景模板。
- `GET /api/admin/event-share-overrides`：分页查看赛事的分享继承/覆盖状态。
- `PUT /api/admin/events/:id/share-override`：覆盖单赛事标题或图片。
- `DELETE /api/admin/events/:id/share-override`：恢复继承全局模板。
- `GET /api/admin/release-notes`、`POST /api/admin/release-notes`、`PUT /api/admin/release-notes/:id`：管理更新日志草稿。
- `PATCH /api/admin/release-notes/:id/status`：执行 `publish` 或 `offline`；已发布正文需先下线才能编辑。

分享标题支持 `{eventName}`、`{city}`、`{eventDate}`、`{distance}`、`{judgement}`、`{latestVersion}`；未知变量会被拒绝，解析后超过 40 字自动省略。外部图片必须是 `SHARE_IMAGE_ALLOWED_HOSTS` 中的 HTTPS 地址。

## AI 辅助赛事源

- `GET /api/admin/event-sources`
- `POST /api/admin/event-sources`
- `PUT /api/admin/event-sources/:id`
- `POST /api/admin/event-sources/:id/run`
- `GET /api/admin/event-source-runs?sourceId=<sourceId>&status=<status>&page=1&pageSize=20`
- `GET /api/admin/event-candidate-stats?sourceId=<sourceId>`
- `GET /api/admin/event-candidates?status=<status>&sourceId=<sourceId>&issue=<issue>&sort=priority&page=1&pageSize=20`
- `PUT /api/admin/event-candidates/:id`
- `POST /api/admin/event-candidates/:id/review`

AI 赛事源对新赛事只生成候选草稿；官方或可信来源再次命中已发布赛事时只刷新检查时间或生成变更告警。管理员可以先编辑候选字段和证据，再采纳为 `publishStatus=draft` 的赛事；仍需进入赛事编辑页继续核验、补充和发布。

当前 `POST /api/admin/event-sources/:id/run` 支持四种来源：

- `page_url`：校验允许域名、遵守 `robots.txt`、读取页面正文，并调用配置的 GLM、DeepSeek 或 OpenAI 模型生成候选。页面必须能被服务端直接读取到赛事正文；验证码、腾讯 EdgeOne 访问验证、纯前端壳或反爬状态会作为失败记录到 `lastRunStatus`。
- `chinaath_api`：按一个大湾区内地城市编码读取中国田协公开赛事目录，不需要 AI API Key。应用硬上限为 2 页 x 20 条。
- `world_athletics`：读取香港未来一年 Road Running 日历，固定使用世界田联页面中的结构化数据。
- `chinamarathon_sitemap`：读取不超过 100KB 的 sitemap，并顺序解析最多 10 个大湾区详情页；统一标记为社区来源，不写入聚合报名链接。

创建或更新来源时可配置低内存调度参数：

```json
{
  "name": "中国田协官方赛事目录",
  "sourceType": "chinaath_api",
  "cityHints": ["广州"],
  "status": "active",
  "scheduleEnabled": false,
  "scheduleIntervalHours": 24,
  "pageSize": 20,
  "maxPagesPerRun": 1,
  "notes": "先手动验证，再开启自动调度"
}
```

`scheduleIntervalHours` 范围为 1-168，`pageSize` 范围为 1-20，`maxPagesPerRun` 范围为 1-2。`page_url` 强制为 1 页，社区 sitemap 最多 10 条；固定来源的 URL、域名和目标城市由服务端覆盖。客户端不能修改分页游标、租约 token、失败次数或最近运行结果。

运行成功返回批量摘要：

```json
{
  "runId": "cm...",
  "sourceId": "cm...",
  "trigger": "manual",
  "totalAvailable": 2830,
  "startPage": 1,
  "endPage": 1,
  "pageCount": 1,
  "nextPage": 2,
  "fetched": 20,
  "created": 16,
  "updated": 2,
  "skippedReviewed": 2,
  "skippedExpired": 3,
  "skippedOutsideRegion": 4,
  "duplicateEvents": 1,
  "changeAlertsCreated": 1,
  "changeAlertsExisting": 2,
  "candidateIds": ["cm...", "cm..."]
}
```

手动运行和系统 cron 共用数据库租约；同一来源正在运行时，手动接口返回 HTTP 409。每次执行都会写入运行历史：

```json
{
  "items": [
    {
      "id": "cm...",
      "sourceId": "cm...",
      "trigger": "scheduled",
      "status": "succeeded",
      "startPage": 1,
      "endPage": 1,
      "pageCount": 1,
      "fetched": 20,
      "created": 16,
      "updated": 2,
      "changeAlertsCreated": 1,
      "changeAlertsExisting": 2,
      "skippedExpired": 3,
      "skippedOutsideRegion": 4,
      "errorMessage": null,
      "startedAt": "2026-07-14T02:00:00.000Z",
      "finishedAt": "2026-07-14T02:00:08.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

`GET /api/admin/event-candidates` 支持来源、状态、问题代码和 `readiness=ready|blocked` 筛选。问题代码为 `missing_event_date`、`missing_official_url`、`missing_source_url`、`duplicate_event`、`source_date_conflict`；默认 `sort=priority`，也可使用 `sort=newest`。响应为 `{ items, total, page, pageSize }`，`pageSize` 最大 50。

候选审核与批量发布接口：

- `GET /api/admin/event-candidate-duplicate-groups`：返回同城、同日且距离重叠的待审核候选组和推荐主候选。
- `POST /api/admin/event-candidates/merge`：提交 `{ primaryId, mergedIds }`，由管理员确认主候选并合并证据。
- `POST /api/admin/event-candidates/bulk-accept`：提交 `{ candidateIds, dryRun, expected? }`；apply 的 `expected` 使用预览返回的 `id / updatedAt`。
- `POST /api/admin/events/bulk-publish`：请求结构与批量采纳相同，字段名为 `eventIds`；只发布完整且未变化的草稿。
- `GET /api/admin/workflow-stats`：返回重复组、可采纳候选、可发布草稿和缺少官方依据数量。

自动或手动抓取都只创建、刷新后台候选。人工采纳后也只创建 `publishStatus=draft`，不会自动发布到小程序。`search_query` 与 `rss` 仍只保留配置字段，本版本不执行。

## 赛事变更复核

- `GET /api/admin/event-change-alerts?page=1&pageSize=20&status=open&severity=critical&changedField=eventDate&search=广州`
- `GET /api/admin/event-change-alerts/summary`
- `POST /api/admin/event-change-alerts/:id/resolve`

只有 `official` 和 `trusted` 来源再次命中已采纳且已发布赛事时才会检查变化。来源未明确提供的空值不会覆盖现有值，也不会生成“字段删除”告警；相同赛事、来源和规范化 fingerprint 只保留一条告警。`community`、`secondary` 和 `unknown` 来源继续只负责发现候选。

处理接口必须先 dry-run：

```json
{
  "dryRun": true,
  "action": "apply_fields",
  "fields": ["eventDate", "officialUrl"],
  "note": "已对照官方公告确认变更"
}
```

dry-run 返回 `preview.expected.alertUpdatedAt` 和 `preview.expected.eventUpdatedAt`。正式应用时提交相同动作、字段和备注，设置 `dryRun=false` 并原样携带 `expected`；任一快照变化都返回 HTTP 409，且不修改赛事或告警。`dismiss` 必须填写 4-500 字备注；`archive_event` 只接受严重的取消信号。`content_reviewer` 只能忽略，`event_operator` 和 `super_admin` 才能应用字段或归档赛事。每次处理写入 `AdminOperationLog`，不保存完整网页或原始响应。

## 工作台

- `GET /api/admin/dashboard`
- `GET /api/admin/data-quality/summary`
- `POST /api/admin/data-quality/cleanup`
- `GET /api/admin/interaction-stats?days=7|30`
- `GET /api/admin/event-choice-stats?page=1&pageSize=20&search=广州&publishStatus=published&eventDateFrom=2026-01-01&eventDateTo=2026-12-31&sort=total_desc`
- `GET /api/admin/workflow-stats`

选择数据接口返回筛选范围内的匿名用户去重数、当前选择记录数、三种选择数量、涉及赛事数，以及逐场赛事汇总。`sort` 支持 `total_desc`、`recent_choice_desc`、`event_date_asc`、`event_date_desc`。接口不返回 `userKey`、匿名标识或参与者列表；“已报名”为用户自报，不代表官方报名人数。

数据治理接口默认使用 `dryRun=true` 返回各动作的数量和少量样例。应用时必须由 `super_admin` 提交 `dryRun=false`，并原样带回预览的 `expected` 数量；数量发生变化时返回 HTTP 409。治理只归档或驳回并写入操作日志，不物理删除记录。

## 小程序公开接口

- `GET /api/events`
- `GET /api/events/:id`
- `POST /api/preferences`
- `GET /api/preferences/:userKey`
- `POST /api/favorites`
- `DELETE /api/favorites/:eventId?userKey=<userKey>`
- `GET /api/favorites?userKey=<userKey>`
- `PUT /api/event-choices`
- `GET /api/event-choices?userKey=<userKey>&choice=<optional>`
- `GET /api/event-choices/:eventId?userKey=<userKey>`
- `DELETE /api/event-choices/:eventId?userKey=<userKey>`
- `GET /api/events/:id/source-summary`
- `POST /api/feedback`
- `POST /api/interactions`
- `GET /api/checklist/templates`
- `GET /api/share-settings`
- `GET /api/release-notes?limit=10&cursor=<optional>`
- `GET /api/release-notes/latest`
- `POST /api/share-records`

## V0.5.3 用户与提醒

- `POST /api/auth/wechat`：使用 `wx.login` code 静默注册或登录，并幂等关联历史匿名 `userKey`。
- `GET /api/users/me`、`PUT /api/users/me`、`DELETE /api/users/me`：读取、更新或注销本人账号。
- `POST /api/users/me/avatar-upload-grants`：创建 5 分钟有效、一次性的 UniCloud 头像上传凭证。
- `POST /api/activity`：记录按用户和北京时间日期去重的增长行为。
- `GET /api/users/me/reminders`、`POST /api/users/me/reminders`、`DELETE /api/users/me/reminders/:eventId/:type`：查询、订阅或取消本人赛事提醒。
- `GET /api/admin/users`、`GET /api/admin/users/:id`：超级管理员分页查看用户和行为摘要。
- `POST /api/admin/users/:id/reveal-openid`：单次查看完整 OpenID，并写入管理员操作日志。
- `PATCH /api/admin/users/:id/status`、`DELETE /api/admin/users/:id/profile`：禁用/恢复用户或清除违规资料。
- `GET /api/admin/growth-stats?days=7|30`、`GET /api/admin/reminder-stats`：读取用户增长、分享归因和提醒汇总。

用户接口使用 `Authorization: Bearer <user token>`。功能开关关闭时，公开赛事与旧版匿名接口继续可用；头像文件只保存 UniCloud `fileID`，OpenID 不通过本人接口返回。

公开赛事接口只返回 `publishStatus = published`、比赛日期晚于北京时间当天且城市属于粤港澳大湾区的赛事，不返回 hidden / offline / archived。

更新日志公开接口只返回 `published`，按业务更新时间倒序分页；`latest` 按首次发布时间返回最新可见记录，用于本机未读红点。

`GET /api/events`、`GET /api/events/:id` 和收藏列表额外返回 `sourceCheckedAt` 与布尔值 `sourceReviewPending`。公开接口不返回告警差异、证据原文、管理员备注、内部严重度或处理状态。

赛事详情返回 `choiceCounts`，从首票开始展示“想跑 / 观望 / 已报名”的准确数据库聚合数量；不返回 `userKey` 或参与者列表。“已报名”是用户自报，不代表官方报名数据。赛事列表不执行逐场计数查询。

`GET /api/events/:id/source-summary` 只返回当前公开赛事已经人工发布的摘要、关键点、限制说明、来源元数据和 stale 状态。无发布版本返回 HTTP 404；不返回网页正文、模型密钥、候选原始数据或管理员备注。

`POST /api/interactions` 接受详情查看、官方入口复制、来源摘要打开、来源摘要成功查看和原始来源链接复制。服务端使用 HMAC 保存匿名用户标识，并按用户、赛事、动作和北京时间日期去重。

## 来源摘要运营

- `POST /api/admin/events/:id/source-summaries/generate`：从赛事已核验来源生成草稿，不接受请求体任意 URL。
- `GET /api/admin/events/:id/source-summaries`：查看版本历史和生成元数据，不返回网页正文。
- `PUT /api/admin/source-summaries/:id`：携带 `expectedUpdatedAt` 编辑草稿。
- `POST /api/admin/source-summaries/:id/publish`：携带快照和 4-500 字备注人工发布。

批量补草稿命令默认 dry-run，生产环境按顺序逐条执行，最大 Node heap 为 160MB：

```bash
pnpm source-summary:backfill
pnpm source-summary:backfill -- --apply --expected <预览数量>
```

`POST /api/feedback` 支持 `event_correction` 与 `product_feedback`。旧请求未传 `scope` 时仍按赛事纠错处理并要求公开赛事；产品反馈不接受 `eventId`，可携带固定页面标识、小程序版本和关联 API 问题编号。两类反馈均要求 6-500 字正文并执行异常探测、24 小时重复保护和频率限制。

所有 API 错误响应返回 `{ message, requestId }`，响应头同时提供 `X-Request-Id`。`GET /health` 保留原字段并增加 `release` 与 `databaseLatencyMs`。
