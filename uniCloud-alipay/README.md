# WorthRun UniCloud 支付宝云头像服务

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
