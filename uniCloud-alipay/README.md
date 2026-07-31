# WorthRun UniCloud 支付宝云服务

## 赛事媒体函数 `worthrun-event-media`

该函数负责接收后台从已确认官网/主办方页面发现的图片，校验图片魔数和大小，保存原图并生成 1600×900 主图、640×360 缩略图，再回调 API 登记文件 ID。公共 API 只会返回已人工批准且已完成两种衍生图上传的临时地址，否则使用品牌默认封面。

部署时配置：

- `MAIN_API_BASE_URL`：例如 `https://run-api.example.com`
- `EVENT_MEDIA_SHARED_SECRET`：与 ECS 上 `UNICLOUD_EVENT_MEDIA_SHARED_SECRET` 一致

函数 URL 化 PATH 为 `/worthrun-event-media`，生成的 HTTPS 地址写入 ECS 的 `UNICLOUD_EVENT_MEDIA_BASE_URL`。不要把真实密钥写入仓库或截图。

`sharp` 是生成主图和缩略图的必要依赖；若部署环境无法加载它，函数会保留原格式并如实登记原尺寸，不能把这视为完成了 640×360 缩略图验收。

## 头像函数 `worthrun-avatar`

`worthrun-avatar` 用于将小程序头像直接上传至 UniCloud 支付宝云空间，不经过 ECS。

当前关联空间：

- 服务商：支付宝云（`alipay`）
- Space ID：`env-00jy6bpz3vhc`
- URL 化路径：`/worthrun-avatar`
- URL 化测试域名：`https://env-00jy6bpz3vhc.dev-hz.cloudbasefunction.cn`
- 默认下载域名：`https://env-00jy6bpz3vhc.normal.cloudstatic.cn`
- DCloud AppID：`NADF29805`（仅用于 HBuilderX/UniCloud 部署，不替代微信小程序 AppID）

空间控制台显示有效期至 `2026-08-26 23:59:59 +08:00`，正式上线前必须续期或确认不会在运营期失效。

部署时为云函数配置：

- `MAIN_API_BASE_URL`：例如 `https://run-api.example.com`
- `AVATAR_SHARED_SECRET`：与 ECS 上 `UNICLOUD_AVATAR_SHARED_SECRET` 一致

上传云函数后，在 UniCloud Web 控制台进入“云函数/云对象 -> 函数/对象列表 -> `worthrun-avatar` 详情”，然后在“环境变量”区域配置以上两个变量；不要提交真实 `.env` 或在截图中暴露共享密钥。

支付宝云默认使用 Node.js 18。`package.json` 不显式填写 `runtime`，保持对旧版 HBuilderX UniCloud 上传插件的兼容。

函数详情的“云函数URL化”区域应显示 PATH `/worthrun-avatar`。控制台给出的默认测试域名为 `https://env-00jy6bpz3vhc.dev-hz.cloudbasefunction.cn`；总览页的 `api-hz` request 域名不是本函数的 URL 化入口。

启用 URL 化后，把 HTTPS 地址写入 ECS 的 `UNICLOUD_AVATAR_BASE_URL`，并在微信公众平台同时配置 `request` / `uploadFile` / `downloadFile` 合法域名。未携带有效业务参数的公网请求应到达函数并返回业务层 4xx，不应再返回平台层 `50002`。

当前小程序需要配置：

- `uploadFile`：`https://env-00jy6bpz3vhc.dev-hz.cloudbasefunction.cn`
- `downloadFile`：`https://env-00jy6bpz3vhc.normal.cloudstatic.cn`
- API `request`：`https://run-api.huangjiarong.top`

内置云存储上传域名由云函数服务端使用，不需要加入小程序合法域名。

UniCloud 支付宝云空间的云存储权限必须设为“仅云函数可读写”，小程序只使用 `getTempFileURL` 生成的短期地址显示头像。

上线前必须使用真机验证 JPEG、PNG、WebP，以及 2MB 超限拒绝、凭证重放拒绝和旧头像删除。
