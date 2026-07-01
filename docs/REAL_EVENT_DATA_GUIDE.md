# 真实赛事数据准备指南

本指南用于把 `docs/seed-events-template.csv` 从演示数据替换为可内测的真实赛事数据。原则是：不编造赛事、不编造官方链接，不确定字段保留 `unknown` 或写明“待核实”。

## 字段要求

CSV 字段保持与模板一致：

- `eventName`：赛事官方名称，尽量与官方公告一致。
- `city`：城市名称，例如广州、深圳、佛山、香港、澳门。
- `eventDate`：比赛日期，格式为 `YYYY-MM-DD`。未确认不要猜测。
- `distanceItems`：距离项目，用 `|` 分隔，例如 `10K|半马`。
- `signupStatus`：`signup_open`、`closing_soon`、`closed`、`not_started`、`unknown`。
- `signupDeadline`：报名截止时间，建议使用 ISO 时间；未知则留空。
- `officialUrl`：官方入口。必须来自赛事官网、官方公众号公告、官方报名平台或主办方发布页。
- `sourceName`：来源名称，例如“赛事官网”“官方公众号”“主办方公告”。
- `sourceUrl`：信息来源链接。无法确认时留空或写 `unknown`。
- `sourceLevel`：`official`、`trusted`、`secondary`、`unknown`。
- `runJudgement`：`priority`、`watch`、`unverified`。
- `judgementSummary`：一句话跑前判断，不替用户做报名承诺。
- `judgementReasons`：判断理由，用 `|` 分隔。
- `suitableFor` / `notSuitableFor`：适合/不适合人群，用 `|` 分隔。
- `tags`：体验标签，用 `|` 分隔。

## 官方入口要求

- 优先使用赛事官网、官方报名页、官方公众号原文、主办/承办单位公告。
- 不使用无法追溯来源的聚合页作为 `officialUrl`。
- 不把搜索结果页、短链、截图、朋友圈转述当作官方入口。
- 官方入口暂缺时，`officialUrl` 不要编造；先保持待核实，等确认后再导入或发布。

## 来源等级

- `official`：赛事官网、官方公众号、官方报名平台、主办方公告。
- `trusted`：政府/体育局/协会公告、长期合作的权威赛事服务平台。
- `secondary`：媒体报道、跑步平台资讯、社区转述，必须二次核对。
- `unknown`：来源不明确、链接失效、字段需要人工确认。

## 不确定字段标记

- 报名状态不确定：`signupStatus=unknown`。
- 来源不确定：`sourceLevel=unknown`，`sourceName` 写“待核实来源”。
- 日期、路线、关门时间、领物安排未确认：在 `judgementReasons` 或清单中写“待核实”。
- 跑前判断不充分：`runJudgement=unverified`。
- 不要为了让页面好看补虚假的截止时间、报名链接或路线亮点。

## 导入前检查清单

每批至少 10 条真实数据导入前，逐条检查：

1. 赛事名称与官方来源一致。
2. 城市、比赛日期、距离项目没有从非官方来源猜测。
3. 官方入口可打开，且不是 `example.com`。
4. 报名状态与官方入口当前信息一致；不确定则为 `unknown`。
5. 报名截止时间有来源；没有来源则留空。
6. 来源等级符合来源类型，二级来源不冒充官方来源。
7. 跑前判断理由至少 1 条，且没有“保证报名成功”等承诺性表述。
8. 适合/不适合人群与赛事距离、交通、信息完整度相关。
9. 标签不夸大，不把待核实信息标成“信息完整”。
10. 合规提示仍保留：`AI 整理，仅供参考，报名以官方为准。`
11. 后台小程序发布前检查全部通过后，再设为发布状态。
12. 随机抽查至少 2 条，在小程序详情页确认“前往官方确认”可复制官方链接。
