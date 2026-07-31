import { Alert, Button, Card, Input, Segmented, Select, Space, Statistic, Table, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api';
import type {
  AdminReminderItem,
  GrowthFunnelResponse,
  GrowthFunnelSource,
  GrowthStats,
  ReminderDeliveryRunItem,
  ReminderReadiness,
  SystemHealth,
} from '../types';

const reminderBlockerLabels: Record<string, string> = {
  reminder_config_incomplete: '提醒模板配置不完整',
  runtime_config_mismatch: '运行配置与服务器文件不一致',
  unicloud_expiring: 'UniCloud 空间有效期不足 30 天',
  formal_state_required: '正式提醒必须使用 formal 环境',
  reminder_cron_stale: '提醒任务超过 30 分钟未运行',
  overdue_pending: '存在逾期待发送提醒',
  recent_delivery_failure: '近 24 小时存在发送失败',
};

export function GrowthPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<GrowthStats>();
  const [reminders, setReminders] = useState<Record<string, number>>({});
  const [systemHealth, setSystemHealth] = useState<SystemHealth>();
  const [readiness, setReadiness] = useState<ReminderReadiness>();
  const [reminderItems, setReminderItems] = useState<AdminReminderItem[]>([]);
  const [deliveryRuns, setDeliveryRuns] = useState<ReminderDeliveryRunItem[]>([]);
  const [reminderStatus, setReminderStatus] = useState('');
  const [reminderType, setReminderType] = useState('');
  const [reminderSearch, setReminderSearch] = useState('');
  const [reminderSearchDraft, setReminderSearchDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // V0.6 访客漏斗（独立口径：匿名独立访客，支持 source/campaign 切换）
  const [funnelDays, setFunnelDays] = useState<7 | 28>(28);
  const [funnelSource, setFunnelSource] = useState<GrowthFunnelSource>('all');
  const [funnelCampaign, setFunnelCampaign] = useState('');
  const [visitorFunnel, setVisitorFunnel] = useState<GrowthFunnelResponse>();
  const [funnelLoading, setFunnelLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const reminderParams = new URLSearchParams({ page: '1', pageSize: '50' });
      if (reminderStatus) reminderParams.set('status', reminderStatus);
      if (reminderType) reminderParams.set('reminderType', reminderType);
      if (reminderSearch.trim()) reminderParams.set('search', reminderSearch.trim());
      const [growth, reminderStats, health, readinessResult, reminderList, runList] =
        await Promise.all([
          apiGet<GrowthStats>(`/api/admin/growth-stats?days=${days}`),
          apiGet<Record<string, number>>('/api/admin/reminder-stats'),
          apiGet<SystemHealth>('/api/admin/system-health'),
          apiGet<ReminderReadiness>('/api/admin/reminder-readiness'),
          apiGet<{ items: AdminReminderItem[] }>(
            `/api/admin/reminders?${reminderParams.toString()}`,
          ),
          apiGet<{ items: ReminderDeliveryRunItem[] }>(
            '/api/admin/reminder-runs?page=1&pageSize=20',
          ),
        ]);
      setData(growth);
      setReminders(reminderStats);
      setSystemHealth(health);
      setReadiness(readinessResult);
      setReminderItems(reminderList.items);
      setDeliveryRuns(runList.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '增长数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [days, reminderSearch, reminderStatus, reminderType]);
  useEffect(() => void load(), [load]);
  // 访客漏斗：独立加载（参数与 growth-stats 不同）
  const loadFunnel = useCallback(async () => {
    setFunnelLoading(true);
    try {
      const params = new URLSearchParams({ days: String(funnelDays), source: funnelSource });
      if (funnelCampaign.trim()) params.set('campaign', funnelCampaign.trim());
      setVisitorFunnel(
        await apiGet<GrowthFunnelResponse>(`/api/admin/growth-funnel?${params.toString()}`),
      );
    } catch {
      // 漏斗加载失败不阻塞整页
      setVisitorFunnel(undefined);
    } finally {
      setFunnelLoading(false);
    }
  }, [funnelDays, funnelSource, funnelCampaign]);
  useEffect(() => void loadFunnel(), [loadFunnel]);
  const funnel = data?.funnel;
  return (
    <main className="page growth-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">增长与提醒</h1>
          <div className="page-subtitle">从 V0.5.3 上线日起统计的实名用户增长基线</div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
          刷新
        </Button>
      </div>
      <Segmented
        value={days}
        onChange={(value) => setDays(value as 7 | 30)}
        options={[
          { value: 7, label: '近 7 天' },
          { value: 30, label: '近 30 天' },
        ]}
      />
      {systemHealth &&
        (!systemHealth.features.userSystem.enabled ||
          !systemHealth.features.avatar.configured ||
          !systemHealth.features.reminders.enabled) && (
          <Alert
            type="warning"
            showIcon
            message="V0.5.3 外部能力尚未全部启用"
            description={`用户体系：${systemHealth.features.userSystem.enabled ? '已开启' : systemHealth.features.userSystem.configured ? '配置完成，待开启' : '待配置'}；头像：${systemHealth.features.avatar.configured ? '已配置' : '待配置'}；赛事提醒：${systemHealth.features.reminders.enabled ? '已开启' : systemHealth.features.reminders.configured ? '配置完成，待开启' : '待配置'}`}
          />
        )}
      {error && <Alert type="error" showIcon message={error} />}
      {readiness && (readiness.blockers.length > 0 || readiness.warnings.length > 0) && (
        <Alert
          style={{ marginTop: 16 }}
          type={readiness.healthStatus === 'blocked' ? 'error' : 'warning'}
          showIcon
          message={readiness.blockers.length > 0 ? '提醒正式上线条件尚未满足' : '提醒运营提示'}
          description={[...readiness.blockers, ...readiness.warnings]
            .map((value) => reminderBlockerLabels[value] || value)
            .join('；')}
        />
      )}
      <div className="stat-grid growth-summary">
        <Card>
          <Statistic title="活跃用户" value={data?.activeUsers ?? 0} />
        </Card>
        <Card>
          <Statistic title="新增用户" value={data?.newUsers ?? 0} />
        </Card>
        <Card>
          <Statistic title="D1 留存" value={data?.d1.rate ?? 0} suffix="%" />
        </Card>
        <Card>
          <Statistic title="D7 留存" value={data?.d7.rate ?? 0} suffix="%" />
        </Card>
        <Card>
          <Statistic title="有效提醒" value={reminders.pending ?? 0} />
        </Card>
        <Card>
          <Statistic title="已发送提醒" value={reminders.sent ?? 0} />
        </Card>
      </div>
      <h2 className="section-title">行为漏斗</h2>
      <div className="stat-grid growth-summary">
        <Card>
          <Statistic
            title="查看详情"
            value={funnel?.detailUsers ?? 0}
            suffix={` / ${funnel?.detailRate ?? 0}%`}
          />
        </Card>
        <Card>
          <Statistic
            title="官方入口"
            value={funnel?.officialUsers ?? 0}
            suffix={` / ${funnel?.officialRate ?? 0}%`}
          />
        </Card>
        <Card>
          <Statistic
            title="收藏"
            value={funnel?.favoriteUsers ?? 0}
            suffix={` / ${funnel?.favoriteRate ?? 0}%`}
          />
        </Card>
        <Card>
          <Statistic
            title="选择"
            value={funnel?.choiceUsers ?? 0}
            suffix={` / ${funnel?.choiceRate ?? 0}%`}
          />
        </Card>
        <Card>
          <Statistic
            title="分享"
            value={funnel?.shareUsers ?? 0}
            suffix={` / ${funnel?.shareRate ?? 0}%`}
          />
        </Card>
        <Card>
          <Statistic
            title="提醒订阅"
            value={funnel?.reminderUsers ?? 0}
            suffix={` / ${funnel?.reminderRate ?? 0}%`}
          />
        </Card>
      </div>
      <h2 className="section-title">访客漏斗（匿名独立访客）</h2>
      <Space style={{ marginBottom: 12 }}>
        <Segmented
          value={funnelDays}
          onChange={(v) => setFunnelDays(v as 7 | 28)}
          options={[
            { value: 7, label: '近 7 天' },
            { value: 28, label: '近 28 天' },
          ]}
        />
        <Segmented
          value={funnelSource}
          onChange={(v) => setFunnelSource(v as GrowthFunnelSource)}
          options={[
            { value: 'all', label: '全部' },
            { value: 'campaign', label: 'Campaign' },
            { value: 'share', label: '分享' },
            { value: 'direct', label: '直接' },
          ]}
        />
        <Input
          placeholder="Campaign code（可选）"
          value={funnelCampaign}
          onChange={(e) => setFunnelCampaign(e.target.value)}
          style={{ width: 180 }}
          allowClear
        />
        <Button icon={<ReloadOutlined />} loading={funnelLoading} onClick={() => void loadFunnel()}>
          刷新
        </Button>
      </Space>
      {visitorFunnel ? (
        <div className="stat-grid growth-summary">
          <Card>
            <Statistic
              title="独立访客"
              value={visitorFunnel.funnel.visitors.value}
              suffix={` / ${visitorFunnel.funnel.visitors.base}`}
            />
          </Card>
          <Card>
            <Statistic
              title="雷达浏览"
              value={visitorFunnel.funnel.radarVisitors.value}
              suffix={` / ${visitorFunnel.funnel.radarVisitors.base} (${visitorFunnel.funnel.radarVisitors.rate}%)`}
            />
          </Card>
          <Card>
            <Statistic
              title="查看两场以上"
              value={visitorFunnel.funnel.twoPlusEventVisitors.value}
              suffix={` / ${visitorFunnel.funnel.twoPlusEventVisitors.base} (${visitorFunnel.funnel.twoPlusEventVisitors.rate}%)`}
            />
          </Card>
          <Card>
            <Statistic
              title="设置偏好"
              value={visitorFunnel.funnel.preferenceVisitors.value}
              suffix={` / ${visitorFunnel.funnel.preferenceVisitors.base} (${visitorFunnel.funnel.preferenceVisitors.rate}%)`}
            />
          </Card>
          <Card>
            <Statistic
              title="任一核心动作"
              value={visitorFunnel.funnel.coreActionVisitors.value}
              suffix={` / ${visitorFunnel.funnel.coreActionVisitors.base} (${visitorFunnel.funnel.coreActionVisitors.rate}%)`}
            />
          </Card>
          <Card>
            <Statistic
              title="分享发起"
              value={visitorFunnel.funnel.shareVisitors.value}
              suffix={` / ${visitorFunnel.funnel.shareVisitors.base} (${visitorFunnel.funnel.shareVisitors.rate}%)`}
            />
          </Card>
        </div>
      ) : (
        <p>{funnelLoading ? '加载中…' : '暂无访客漏斗数据'}</p>
      )}
      <h2 className="section-title">分享归因</h2>
      <div className="stat-grid growth-summary">
        <Card>
          <Statistic title="分享发起" value={data?.attribution.shareStarts ?? 0} />
        </Card>
        <Card>
          <Statistic title="分享访问" value={data?.attribution.referralVisitors ?? 0} />
        </Card>
        <Card>
          <Statistic title="带来新用户" value={data?.attribution.referredNewUsers ?? 0} />
        </Card>
        <Card>
          <Statistic title="访问后查看详情" value={data?.attribution.referralDetailUsers ?? 0} />
        </Card>
        <Card>
          <Statistic
            title="访问到详情转化"
            value={data?.attribution.referralToDetailRate ?? 0}
            suffix="%"
          />
        </Card>
      </div>
      <h2 className="section-title">提醒资格与授权</h2>
      <div className="stat-grid growth-summary">
        <Card>
          <Statistic title="可订阅赛事" value={readiness?.eligibleEvents ?? 0} />
        </Card>
        <Card>
          <Statistic title="报名提醒可用" value={readiness?.signupEligibleEvents ?? 0} />
        </Card>
        <Card>
          <Statistic title="赛前提醒可用" value={readiness?.raceEligibleEvents ?? 0} />
        </Card>
        <Card>
          <Statistic title="缺少开赛时间" value={readiness?.missingEventStartAt ?? 0} />
        </Card>
        <Card>
          <Statistic title="逾期待发送" value={readiness?.overduePending ?? 0} />
        </Card>
        <Card>
          <Statistic
            title="最近任务"
            value={
              readiness?.latestRunAgeMinutes === null ||
              readiness?.latestRunAgeMinutes === undefined
                ? '-'
                : readiness.latestRunAgeMinutes
            }
            suffix={readiness?.latestRunAgeMinutes == null ? undefined : '分钟前'}
          />
        </Card>
        <Card>
          <Statistic
            title="云空间有效期"
            value={readiness?.cloudDaysRemaining ?? '-'}
            suffix={readiness?.cloudDaysRemaining == null ? undefined : '天'}
          />
        </Card>
        <Card>
          <Statistic title="看到提醒" value={data?.reminderFunnel.viewed ?? 0} />
        </Card>
        <Card>
          <Statistic
            title="调起授权"
            value={data?.reminderFunnel.requested ?? 0}
            suffix={` / ${data?.reminderFunnel.viewToRequestRate ?? 0}%`}
          />
        </Card>
        <Card>
          <Statistic
            title="微信允许"
            value={data?.reminderFunnel.accepted ?? 0}
            suffix={` / ${data?.reminderFunnel.requestToAcceptRate ?? 0}%`}
          />
        </Card>
        <Card>
          <Statistic
            title="订阅成功"
            value={data?.reminderFunnel.subscribed ?? 0}
            suffix={` / ${data?.reminderFunnel.acceptToSubscribeRate ?? 0}%`}
          />
        </Card>
      </div>
      {readiness?.latestRun && (
        <Alert
          style={{ marginTop: 16 }}
          type={readiness.latestRun.status === 'succeeded' ? 'success' : 'warning'}
          showIcon
          message={`最近提醒任务：${readiness.latestRun.status}`}
          description={`模式 ${readiness.latestRun.mode} · 到期 ${readiness.latestRun.dueCount} · 发送 ${readiness.latestRun.sentCount} · 失败 ${readiness.latestRun.failedCount} · 跳过 ${readiness.latestRun.skippedCount}`}
        />
      )}
      <h2 className="section-title">提醒记录</h2>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          allowClear
          placeholder="搜索赛事"
          style={{ width: 220 }}
          value={reminderSearchDraft}
          onChange={(event) => setReminderSearchDraft(event.target.value)}
          onPressEnter={() => setReminderSearch(reminderSearchDraft.trim())}
        />
        <Select
          allowClear
          placeholder="提醒类型"
          style={{ width: 140 }}
          value={reminderType || undefined}
          onChange={(value) => setReminderType(value || '')}
          options={[
            { value: 'signup', label: '报名提醒' },
            { value: 'race_week', label: '赛前提醒' },
          ]}
        />
        <Select
          allowClear
          placeholder="提醒状态"
          style={{ width: 150 }}
          value={reminderStatus || undefined}
          onChange={(value) => setReminderStatus(value || '')}
          options={[
            { value: 'pending', label: '待发送' },
            { value: 'sending', label: '发送中' },
            { value: 'sent', label: '已发送' },
            { value: 'failed', label: '失败' },
            { value: 'review_required', label: '待复核' },
            { value: 'cancelled', label: '已取消' },
          ]}
        />
        <Button onClick={() => setReminderSearch(reminderSearchDraft.trim())}>查询</Button>
      </Space>
      <Table<AdminReminderItem>
        rowKey="id"
        size="small"
        dataSource={reminderItems}
        pagination={false}
        scroll={{ x: 980 }}
        columns={[
          { title: '赛事', dataIndex: ['event', 'eventName'] },
          {
            title: '类型',
            dataIndex: 'reminderType',
            width: 110,
            render: (value) => (value === 'signup' ? '报名提醒' : '赛前提醒'),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (value) => (
              <Tag color={value === 'sent' ? 'green' : value === 'failed' ? 'red' : 'blue'}>
                {value}
              </Tag>
            ),
          },
          {
            title: '计划时间',
            dataIndex: 'scheduledAt',
            width: 190,
            render: (value) => value || '-',
          },
          { title: '尝试次数', dataIndex: 'attempts', width: 100 },
          {
            title: '最近错误',
            dataIndex: 'lastErrorCode',
            width: 220,
            render: (value) => value || '-',
          },
        ]}
      />
      <h2 className="section-title">任务运行记录</h2>
      <Table<ReminderDeliveryRunItem>
        rowKey="id"
        size="small"
        dataSource={deliveryRuns}
        pagination={false}
        scroll={{ x: 980 }}
        columns={[
          { title: '开始时间', dataIndex: 'startedAt', width: 190 },
          { title: '模式', dataIndex: 'mode', width: 100 },
          {
            title: '结果',
            dataIndex: 'status',
            width: 110,
            render: (value) => (
              <Tag color={value === 'succeeded' ? 'green' : value === 'failed' ? 'red' : 'orange'}>
                {value}
              </Tag>
            ),
          },
          { title: '到期', dataIndex: 'dueCount', width: 80 },
          { title: '发送', dataIndex: 'sentCount', width: 80 },
          { title: '失败', dataIndex: 'failedCount', width: 80 },
          { title: '跳过', dataIndex: 'skippedCount', width: 80 },
          {
            title: '错误类别',
            dataIndex: 'errorCategory',
            width: 220,
            render: (value) => value || '-',
          },
          { title: '版本', dataIndex: 'release', width: 130, render: (value) => value || '-' },
        ]}
      />
    </main>
  );
}
