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
- `GET /api/admin/event-candidates?status=<status>&sourceId=<sourceId>`
- `PUT /api/admin/event-candidates/:id`
- `POST /api/admin/event-candidates/:id/review`

AI 赛事源只生成候选草稿。管理员可以先编辑候选字段和证据，再采纳为 `publishStatus=draft` 的赛事；仍需进入赛事编辑页继续核验、补充和发布。

当前 `POST /api/admin/event-sources/:id/run` 支持两种来源：

- `page_url`：校验允许域名、遵守 `robots.txt`、读取页面正文，并调用配置的 GLM、DeepSeek 或 OpenAI 模型生成候选。页面必须能被服务端直接读取到赛事正文；验证码、腾讯 EdgeOne 访问验证、纯前端壳或反爬状态会作为失败记录到 `lastRunStatus`。
- `chinaath_api`：读取固定的中国田协公开赛事目录，一次最多映射 20 条结构化候选，不需要 AI API Key。目录链接只作为来源证据，不得当成赛事官方报名入口。

运行成功返回批量摘要：

```json
{
  "sourceId": "cm...",
  "totalAvailable": 2830,
  "fetched": 20,
  "created": 16,
  "updated": 2,
  "skippedReviewed": 2,
  "duplicateEvents": 1,
  "candidateIds": ["cm...", "cm..."]
}
```

`GET /api/admin/event-candidates` 的 `status` 和 `sourceId` 都是可选筛选参数。`search_query` 与 `rss` 仍只保留配置字段，本版本不执行。

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
