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

## 操作日志

- `GET /api/admin/operation-logs`

支持 `targetType`、`targetId` 查询。

## 系统配置

- `GET /api/admin/system-configs`
- `PUT /api/admin/system-configs/:key`

## AI 辅助赛事源

- `GET /api/admin/event-sources`
- `POST /api/admin/event-sources`
- `PUT /api/admin/event-sources/:id`
- `POST /api/admin/event-sources/:id/run`
- `GET /api/admin/event-source-runs?sourceId=<sourceId>&status=<status>&page=1&pageSize=20`
- `GET /api/admin/event-candidates?status=<status>&sourceId=<sourceId>&issue=<issue>&sort=priority&page=1&pageSize=20`
- `PUT /api/admin/event-candidates/:id`
- `POST /api/admin/event-candidates/:id/review`

AI 赛事源只生成候选草稿。管理员可以先编辑候选字段和证据，再采纳为 `publishStatus=draft` 的赛事；仍需进入赛事编辑页继续核验、补充和发布。

当前 `POST /api/admin/event-sources/:id/run` 支持两种来源：

- `page_url`：校验允许域名、遵守 `robots.txt`、读取页面正文，并调用配置的 GLM、DeepSeek 或 OpenAI 模型生成候选。页面必须能被服务端直接读取到赛事正文；验证码、腾讯 EdgeOne 访问验证、纯前端壳或反爬状态会作为失败记录到 `lastRunStatus`。
- `chinaath_api`：读取固定的中国田协公开赛事目录，不需要 AI API Key。默认每次读取 1 页 x 20 条，应用硬上限为 2 页 x 20 条；目录链接只作为来源证据，不得当成赛事官方报名入口。

创建或更新来源时可配置低内存调度参数：

```json
{
  "name": "中国田协官方赛事目录",
  "sourceType": "chinaath_api",
  "cityHints": ["广州", "深圳"],
  "status": "active",
  "scheduleEnabled": false,
  "scheduleIntervalHours": 24,
  "pageSize": 20,
  "maxPagesPerRun": 1,
  "notes": "先手动验证，再开启自动调度"
}
```

`scheduleIntervalHours` 范围为 1-168，`pageSize` 范围为 1-20，`maxPagesPerRun` 范围为 1-2。`page_url` 会强制使用 `pageSize=1`、`maxPagesPerRun=1`。开启调度且来源为启用状态时，后端设置 `nextRunAt`；暂停来源或关闭调度会清空 `nextRunAt`。客户端不能修改分页游标、租约 token、失败次数或最近运行结果。

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
  "duplicateEvents": 1,
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

`GET /api/admin/event-candidates` 支持来源、状态和问题代码筛选。问题代码为 `missing_event_date`、`missing_official_url`、`missing_source_url`、`duplicate_event`；默认 `sort=priority`，也可使用 `sort=newest`。响应为 `{ items, total, page, pageSize }`，`pageSize` 最大 50。

自动或手动抓取都只创建、刷新后台候选。人工采纳后也只创建 `publishStatus=draft`，不会自动发布到小程序。`search_query` 与 `rss` 仍只保留配置字段，本版本不执行。

## 工作台

- `GET /api/admin/dashboard`

## 小程序公开接口

- `GET /api/events`
- `GET /api/events/:id`
- `POST /api/preferences`
- `GET /api/preferences/:userKey`
- `POST /api/favorites`
- `DELETE /api/favorites/:eventId?userKey=<userKey>`
- `GET /api/favorites?userKey=<userKey>`
- `POST /api/feedback`
- `GET /api/checklist/templates`

公开赛事接口只返回 `publishStatus = published` 的赛事，不返回 hidden / offline / archived。

`POST /api/feedback` 需要 `eventId`、`userKey`、`requestId`、白名单内的 `feedbackType` 和 `content`。同一 `requestId` 或 24 小时内相同赛事、类型、内容的反馈会返回 HTTP 200 与 `{ duplicate: true }`，不会新增记录；提交频率超限会返回 HTTP 429 和 `Retry-After`。
