import { Button, Card, Space, Statistic, Table, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api';
import { showError } from '../utils/helpers';

interface TopEvent {
  event: { id: string; eventName: string; city: string; eventDate: string } | null;
  count: number;
}

interface DailyStat {
  day: string;
  pageShare: number;
  imageGenerate: number;
  total: number;
}

interface ShareStats {
  total: number;
  pageShares: number;
  imageGenerates: number;
  topEvents: TopEvent[];
  daily: DailyStat[];
}

export function ShareStatsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ShareStats>();
  const [days, setDays] = useState(30);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<ShareStats>(`/api/admin/share-records/stats?days=${days}`)
      .then(setStats)
      .catch(showError)
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(load, [load]);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">分享数据</h1>
          <div className="page-subtitle">观察赛事决策卡的分享传播效果</div>
        </div>
        <Space>
          {[
            { value: 7, label: '近7天' },
            { value: 30, label: '近30天' },
            { value: 90, label: '近90天' },
          ].map((opt) => (
            <Button
              key={opt.value}
              type={days === opt.value ? 'primary' : 'default'}
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
          <Button icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
        </Space>
      </div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className="stat-grid">
          <Card>
            <Statistic title="累计分享总数" value={stats?.total ?? 0} />
          </Card>
          <Card>
            <Statistic
              title="页面分享次数"
              value={stats?.pageShares ?? 0}
              valueStyle={{ color: '#2A9D8F' }}
            />
          </Card>
          <Card>
            <Statistic
              title="分享图生成次数"
              value={stats?.imageGenerates ?? 0}
              valueStyle={{ color: '#E76F51' }}
            />
          </Card>
        </div>

        <Card title="赛事分享 Top 10">
          <Table
            rowKey={(record) => record.event?.id || String(Math.random())}
            loading={loading}
            dataSource={stats?.topEvents || []}
            pagination={false}
            size="small"
            columns={[
              {
                title: '赛事名称',
                dataIndex: ['event', 'eventName'],
                render: (_, record) =>
                  record.event ? (
                    <a onClick={() => navigate(`/events/edit/${record.event!.id}`)}>
                      {record.event.eventName}
                    </a>
                  ) : (
                    <span style={{ color: '#999' }}>赛事已删除</span>
                  ),
              },
              {
                title: '城市',
                dataIndex: ['event', 'city'],
                width: 100,
                render: (value) => value || '-',
              },
              {
                title: '比赛日期',
                dataIndex: ['event', 'eventDate'],
                width: 130,
                render: (value) => (value ? dayjs(value).format('YYYY-MM-DD') : '-'),
              },
              {
                title: '分享次数',
                dataIndex: 'count',
                width: 110,
                render: (value) => <Tag color="green">{value}</Tag>,
              },
            ]}
          />
        </Card>

        <Card title={`每日趋势（${days} 天内）`}>
          <Table
            rowKey="day"
            loading={loading}
            dataSource={stats?.daily || []}
            pagination={false}
            size="small"
            scroll={{ y: 360 }}
            columns={[
              {
                title: '日期',
                dataIndex: 'day',
                width: 130,
                render: (value) => dayjs(value).format('YYYY-MM-DD'),
              },
              {
                title: '页面分享',
                dataIndex: 'pageShare',
                width: 110,
                render: (value) => (value > 0 ? <Tag color="green">{value}</Tag> : value || 0),
              },
              {
                title: '图片生成',
                dataIndex: 'imageGenerate',
                width: 110,
                render: (value) => (value > 0 ? <Tag color="orange">{value}</Tag> : value || 0),
              },
              {
                title: '当日合计',
                dataIndex: 'total',
                width: 110,
                render: (value) => <strong>{value}</strong>,
              },
            ]}
          />
        </Card>
      </Space>
    </main>
  );
}
