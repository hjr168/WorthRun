# 赛事源运营与低内存运行手册

本手册用于后台 AI 赛事源的日常运营和服务器自动任务配置。赛事源只生成候选，不会自动采纳或发布。

## 运营流程

1. 在“AI 赛事源”中新建来源，首次保持“自动运行”关闭。
2. 点击“立即抓取”，确认运行历史为成功，并检查候选数量和来源证据。
3. 在候选列表按“缺少官方入口”“疑似重复”等问题筛选，人工补充并核验。
4. 采纳候选后进入赛事编辑页继续完善；采纳结果仅为 `draft`，不会进入小程序。
5. 手动运行稳定后，再编辑来源开启自动运行，建议先使用 24 小时间隔、每页 10 条、每次 1 页。
6. 定期查看下次运行、连续失败数和运行历史。失败后先确认远端来源、模型 Key、网络和内存，再手动重试。

公开内容必须保留：

> AI 整理，仅供参考，报名以官方为准。

官方入口统一使用：

> 前往官方确认

## 状态判断

- `成功`：本次任务完成；运行历史显示读取、新增、更新和页码。
- `失败`：任务已记录错误并自动退避；连续失败数增加，不会自动发布任何内容。
- `运行中`：已有数据库租约；同一来源再次手动触发会返回 HTTP 409。
- `连续失败 > 0`：优先检查运行历史中的最新错误；恢复成功后计数自动清零。
- `低内存跳过`：cron 日志出现 `event_source_cron_skipped`，本轮没有抢占来源锁，下次继续检查。

运行记录不保存 API Key、完整网页正文或模型原始响应。

## 低内存约束

- 服务器只保留 `worth-running-api` 一个常驻 Node/PM2 进程。
- 不创建常驻赛事源调度进程；系统 cron 每 15 分钟启动一次性任务，完成后退出。
- cron 每次最多处理 1 个到期来源；单来源每次最多 2 页，每页最多 20 条。
- API V8 heap 上限 256MB，PM2 在进程达到 320MB 时重启；cron heap 上限 160MB。
- cron 启动前检查 `MemAvailable`，默认低于 256MB 时跳过。
- 生产 `DATABASE_URL` 建议追加 `connection_limit=2&pool_timeout=10`。

## 部署与 cron

按以下顺序部署：同步代码、安装依赖、生成 Prisma Client、执行迁移、构建、重启 API、手动运行一次 cron、安装 crontab、健康检查。

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @worth-running/database exec prisma migrate deploy
pnpm build
pm2 startOrReload ecosystem.config.cjs --only worth-running-api --env production --update-env
pm2 save
pm2 status
curl -fsS http://127.0.0.1:4000/health
```

先运行 `command -v node`，将结果替换下方 `/absolute/path/to/node`：

```cron
*/15 * * * * /usr/bin/flock -n /tmp/worth-running-event-source.lock /bin/bash -lc 'cd /opt/worth-running && set -a && source .env && set +a && exec /absolute/path/to/node --max-old-space-size=160 apps/api/dist/apps/api/src/eventSourceCron.js' >> /var/log/worth-running-event-source.log 2>&1
```

建议配置 `/etc/logrotate.d/worth-running-event-source`：

```text
/var/log/worth-running-event-source.log {
  weekly
  rotate 4
  compress
  missingok
  notifempty
  copytruncate
}
```

## 上线资源验收

安装 crontab 前，在目标服务器记录基线并执行一次真实小批次：

```bash
free -m
pm2 status
ps -eo pid,rss,cmd --sort=-rss | head -15
cd /opt/worth-running
set -a && source .env && set +a
/usr/bin/time -v /absolute/path/to/node --max-old-space-size=160 apps/api/dist/apps/api/src/eventSourceCron.js
curl -fsS http://127.0.0.1:4000/health
```

必须同时满足：cron 峰值 RSS 不超过 220MB、运行期间 `MemAvailable` 不低于 128MB、系统日志无 OOM kill、API 始终健康、任务结束后没有残留 cron Node 进程。

若不满足，先将来源改为每页 10 条、每次 1 页后复测；仍不满足则关闭自动运行，只保留后台手动抓取。

## 故障恢复

1. 查看后台运行历史和 `/var/log/worth-running-event-source.log`。
2. 确认 `free -m` 可用内存和 API 健康状态。
3. 页面来源检查目标 URL、robots 和模型 Key；中国田协来源不需要 AI Key。
4. 来源接口恢复后，在后台点“立即抓取”验证；成功会清零连续失败数。
5. 任务异常退出后，数据库租约最长 30 分钟过期；不要直接删除锁字段。

首次上线不应批量开启来源。逐个来源手动验证并完成资源验收后，再开启自动运行。
