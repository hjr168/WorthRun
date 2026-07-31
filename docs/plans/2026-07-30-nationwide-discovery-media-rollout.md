# 全国公路跑发现与媒体能力：分阶段上线说明

## 当前状态

- 代码、迁移和云函数已准备，未执行生产迁移、未修改生产 `.env`、未部署 CloudBase。
- `NATIONWIDE_DISCOVERY_ENABLED=false` 时继续使用旧粤港澳大湾区公开发现与发布边界。
- 全国首期目录包括北京、上海、江苏、浙江、广东、四川、重庆、湖北、福建，以及香港、澳门；赛事发布仍由 `event_operator` 最终执行。

## 推荐上线顺序

1. **备份与预检**：备份数据库、API 环境文件、Nginx/PM2 配置；在与生产版本一致的环境运行 `prisma migrate deploy`，确认迁移仅新增可空地区列、数组列、媒体表和首页编排表。
2. **地区回填**：运行迁移自带的已知城市回填；查询 `events` 与 `event_candidates` 中 `province_code IS NULL OR city_code IS NULL` 的记录。无法映射的候选保持 `new/needs_review`，不得发布；人工补齐后再进入核验。
3. **媒体服务**：在目标 CloudBase 项目部署 `uniCloud-alipay/cloudfunctions/worthrun-event-media`，配置与 API 一致的 `EVENT_MEDIA_SHARED_SECRET`、`MAIN_API_BASE_URL`，并在 API 配置 `UNICLOUD_EVENT_MEDIA_SHARED_SECRET`。先上传测试图，验证魔数、MIME、8MB 限制、重定向阻断、临时 URL 和孤儿文件检查。
4. **后台准备**：由 `content_reviewer` / `event_operator` 在“全国发现内容”完成来源页图片发现、预览、批准/驳回、设主图和月份编排；未批准图片自动使用品牌默认封面。
5. **灰度全国 API**：先保持开关为 `false` 部署并验证 `/health`、API 构建、后台登录、头像协议；体验版确认首页月份切换、图片裁切、详情主图和旧偏好兼容后，再将 `NATIONWIDE_DISCOVERY_ENABLED=true` 放入非生产灰度环境。
6. **来源错峰**：按 `nationwideChinaAthSourceDefinitions()` 为九个内地首期省份创建中国田协官方来源，每个来源分页最多两页，间隔错峰；确认租约、内存保护、重复治理和变更告警后，逐步打开定时抓取。候选仍只进人工审核队列。
7. **生产切换**：生产只改 `.env` 中的开关并按现有 PM2 安全重载流程验证，不在本任务中执行。切换后复核 `/api/regions`、`/api/events?provinceCode=...&month=...`、`/api/discovery/home?month=...` 和旧客户端偏好读取。

## 回滚

优先将 `NATIONWIDE_DISCOVERY_ENABLED` 改回 `false` 并重载 API，恢复旧公开边界；新增表和列保留，不执行破坏性回滚。媒体审核不通过时只会降级为默认封面，不影响头像文件协议。

## 必须保留的合规文案

- `前往官方确认`
- `AI 整理，仅供参考，报名以官方为准。`
