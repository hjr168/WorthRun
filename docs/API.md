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
