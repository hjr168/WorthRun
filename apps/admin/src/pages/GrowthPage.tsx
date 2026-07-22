import { Alert, Button, Card, Segmented, Statistic } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api';
import type { GrowthStats, SystemHealth } from '../types';

export function GrowthPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<GrowthStats>();
  const [reminders, setReminders] = useState<Record<string, number>>({});
  const [systemHealth, setSystemHealth] = useState<SystemHealth>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [growth, reminderStats, health] = await Promise.all([
        apiGet<GrowthStats>(`/api/admin/growth-stats?days=${days}`),
        apiGet<Record<string, number>>('/api/admin/reminder-stats'),
        apiGet<SystemHealth>('/api/admin/system-health'),
      ]);
      setData(growth);
      setReminders(reminderStats);
      setSystemHealth(health);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '增长数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [days]);
  useEffect(() => void load(), [load]);
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
    </main>
  );
}
