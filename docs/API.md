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
- `GET /api/admin/event-candidates`
- `PUT /api/admin/event-candidates/:id`
- `POST /api/admin/event-candidates/:id/review`

AI 赛事源只生成候选草稿。管理员可以先编辑候选字段和证据，再采纳为 `publishStatus=draft` 的赛事；仍需进入赛事编辑页继续核验、补充和发布。

当前 `POST /api/admin/event-sources/:id/run` 支持 `page_url` 类型：后端会校验允许域名、遵守 `robots.txt`、读取页面正文并调用 AI 结构化抽取候选赛事。页面源必须能被服务端直接读取到赛事正文；如果目标站返回验证码、腾讯 EdgeOne 访问验证、纯前端壳或反爬状态码，会返回错误并记录 `lastRunStatus`。`search_query` 与 `rss` 类型已保留配置字段，抽取能力后续接入。

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
