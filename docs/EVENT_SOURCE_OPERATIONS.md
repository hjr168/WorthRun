# 赛事源运营与低内存运行手册

本手册用于后台 AI 赛事源的日常运营和服务器自动任务配置。赛事源只生成候选，不会自动采纳或发布。

## 运营流程

1. 在“AI 赛事源”中新建来源，首次保持“自动运行”关闭。
2. 点击“立即抓取”，确认运行历史为成功，并检查候选数量和来源证据。
3. 先打开“疑似重复组”，人工选择主候选并归并来源、距离和证据。
4. 使用“可采纳”筛选和复选框预览；合格项采纳为 `draft`，失败项保留原状态和原因。
5. 在赛事库勾选草稿并预览发布；预览后被编辑过的记录会拒绝发布，其他合格项继续完成。
6. 手动运行稳定后，再编辑来源开启自动运行，建议先使用 24 小时间隔、每页 10 条、每次 1 页。
7. 定期查看下次运行、连续失败数和运行历史。失败后先确认远端来源、模型 Key、网络和内存，再手动重试。

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

所有来源统一只写入大湾区未来赛事。`cityHints` 只能在大湾区范围内进一步缩小目标城市，不能绕过全局地域规则；运行历史会分别显示过期和区域外过滤数量。

V0.4.2 的来源分工：

- 中国田协目录按广州、深圳等 9 个内地城市拆分，每个来源只配置一个城市。
- 世界田联固定发现香港未来一年路跑；中国马拉松 sitemap 只作为社区发现，不提供官方入口。
- 澳门国际马拉松与港珠澳大桥半马官网每 168 小时运行一次，需要已配置的 AI 抽取 Key。
- 不抓取禁止通用爬虫的页面，不绕过验证码、EdgeOne 或其他访问验证。

首次部署先预览，再初始化来源与年度计划候选：

```bash
pnpm event-source:bootstrap-v0.4.2
pnpm event-source:bootstrap-v0.4.2 -- --apply
pnpm data:import-chinaath-plan -- --year 2026
pnpm data:import-chinaath-plan -- --year 2026 --apply --expected 14
```

来源初始化会暂停旧的多城市中国田协来源，创建或更新 13 个 V0.4.2 来源，并按 15 分钟间隔错开首次运行。年度计划导入保留 8 条完整日期和 6 条缺失具体日期的候选，缺失日期候选只能人工补充。

V0.4.3 首次迁移后补充官方确认依据，必须先 dry-run：

```bash
pnpm data:backfill-candidate-confirmation-links
pnpm data:backfill-candidate-confirmation-links -- --apply --expected <预览数量>
```

补链只处理待审核的官方来源候选，不处理社区来源。执行后仍需在后台人工归并、预览采纳和预览发布，不会自动发布赛事。

## 数据治理

部署迁移后先执行 dry-run，核对数量和样例：

```bash
pnpm data-quality:cleanup
```

命令会输出带 `--apply --expected='...'` 的应用参数。只有确认数量与后台“数据质量”概览一致后才能应用；数量漂移会直接终止。治理只将候选和反馈标记为驳回、将赛事标记为归档，并写操作日志，不删除数据。

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
