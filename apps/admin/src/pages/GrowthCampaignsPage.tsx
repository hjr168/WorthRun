import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  message,
} from 'antd';
import { PlusOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { apiGet, apiSend } from '../api';
import { showError } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import { useAdmin } from '../context/AdminContext';
import {
  growthCampaignTypeValues,
  GrowthCampaign,
  GrowthCampaignStatsResponse,
  type GrowthCampaignStatus,
  type GrowthCampaignType,
} from '../types';

const statusLabels: Record<GrowthCampaignStatus, string> = {
  active: '进行中',
  paused: '已暂停',
  archived: '已归档',
};
const statusColors: Record<GrowthCampaignStatus, string> = {
  active: 'green',
  paused: 'orange',
  archived: 'default',
};
const channelLabels: Record<string, string> = {
  wechat_group: '微信群',
  wechat_moments: '朋友圈',
  xiaohongshu: '小红书',
  running_club: '跑团',
  running_store: '跑步门店',
  coach: '教练',
  photographer: '摄影师',
  organizer: '赛事组织方',
  public_account: '公众号',
  other: '其他',
};

interface CampaignFormValues {
  code?: string;
  name: string;
  channelType: GrowthCampaignType;
  partnerName?: string;
  startsAt?: string;
  endsAt?: string;
}

export function GrowthCampaignsPage() {
  const { can } = useAdmin();
  const editable = can('manage_growth_campaigns');
  const [items, setItems] = useState<GrowthCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GrowthCampaign | 'new' | null>(null);
  const [statsFor, setStatsFor] = useState<GrowthCampaign | null>(null);
  const [statsDays, setStatsDays] = useState<7 | 28>(28);
  const [stats, setStats] = useState<GrowthCampaignStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [form] = Form.useForm<CampaignFormValues>();

  const load = () => {
    setLoading(true);
    apiGet<{ items: GrowthCampaign[] }>('/api/admin/growth-campaigns')
      .then((result) => setItems(result.items))
      .catch(showError)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => {
    setEditing('new');
    form.setFieldsValue({
      code: '',
      name: '',
      channelType: 'running_club',
      partnerName: '',
      startsAt: undefined,
      endsAt: undefined,
    });
  };
  const openEdit = (item: GrowthCampaign) => {
    setEditing(item);
    form.setFieldsValue({
      // code 故意不放入表单（创建后不可修改）
      name: item.name,
      channelType: item.channelType,
      partnerName: item.partnerName || '',
    });
  };

  const submit = async () => {
    const values = await form.validateFields();
    try {
      if (editing === 'new') {
        await apiSend('POST', '/api/admin/growth-campaigns', {
          code: values.code,
          name: values.name,
          channelType: values.channelType,
          partnerName: values.partnerName || null,
          startsAt: values.startsAt || null,
          endsAt: values.endsAt || null,
        });
        message.success('Campaign 已创建');
      } else if (editing) {
        await apiSend('PATCH', `/api/admin/growth-campaigns/${editing.id}`, {
          name: values.name,
          channelType: values.channelType,
          partnerName: values.partnerName || null,
        });
        message.success('Campaign 已更新');
      }
      setEditing(null);
      form.resetFields();
      load();
    } catch (error) {
      showError(error);
    }
  };

  const changeStatus = async (item: GrowthCampaign, status: GrowthCampaignStatus) => {
    try {
      await apiSend('PATCH', `/api/admin/growth-campaigns/${item.id}`, { status });
      message.success(`已${status === 'active' ? '恢复' : status === 'paused' ? '暂停' : '归档'}`);
      load();
    } catch (error) {
      showError(error);
    }
  };

  const copyRadarPath = (item: GrowthCampaign) => {
    const path = `/pages/radar/index?campaign=${item.code}`;
    navigator.clipboard
      ?.writeText(path)
      .then(() => message.success('雷达路径已复制'))
      .catch(() => message.info(`路径：${path}`));
  };

  const openStats = (item: GrowthCampaign) => {
    setStatsFor(item);
    setStats(null);
  };

  useEffect(() => {
    if (!statsFor) return;
    setStatsLoading(true);
    apiGet<GrowthCampaignStatsResponse>(
      `/api/admin/growth-campaigns/${statsFor.id}/stats?days=${statsDays}`,
    )
      .then(setStats)
      .catch(showError)
      .finally(() => setStatsLoading(false));
  }, [statsFor, statsDays]);

  const exportCsv = () => {
    const header = [
      'code',
      'name',
      'channelType',
      'status',
      'partnerName',
      'createdAt',
      'visitors',
      'newUsers',
      'radarVisitors',
      'twoPlusVisitors',
      'coreActionVisitors',
      'shareVisitors',
    ];
    downloadCsv('growth-campaigns.csv', [header]);
    message.success('已导出 Campaign 列表（匿名汇总）');
  };

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">增长渠道</h1>
        <div className="page-subtitle">管理运营 Campaign，查看渠道漏斗与归因</div>
        <Space style={{ marginTop: 12 }}>
          {editable && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新建 Campaign
            </Button>
          )}
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>
            导出列表
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={[
          { title: 'Code', dataIndex: 'code', width: 140, render: (v) => <code>{v}</code> },
          { title: '名称', dataIndex: 'name' },
          {
            title: '渠道',
            dataIndex: 'channelType',
            width: 110,
            render: (v: string) => channelLabels[v] || v,
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (v: GrowthCampaignStatus) => (
              <Tag color={statusColors[v]}>{statusLabels[v]}</Tag>
            ),
          },
          { title: '合作方', dataIndex: 'partnerName', width: 140, render: (v) => v || '—' },
          {
            title: '操作',
            width: 320,
            render: (_, item) => (
              <Space wrap>
                <Button size="small" icon={<CopyOutlined />} onClick={() => copyRadarPath(item)}>
                  复制雷达路径
                </Button>
                <Button size="small" onClick={() => openStats(item)}>
                  漏斗
                </Button>
                {editable && <Button size="small" onClick={() => openEdit(item)}>编辑</Button>}
                {editable && item.status === 'active' && (
                  <Popconfirm title="确认暂停？" onConfirm={() => changeStatus(item, 'paused')}>
                    <Button size="small">暂停</Button>
                  </Popconfirm>
                )}
                {editable && item.status === 'paused' && (
                  <Popconfirm title="确认恢复？" onConfirm={() => changeStatus(item, 'active')}>
                    <Button size="small">恢复</Button>
                  </Popconfirm>
                )}
                {editable && item.status !== 'archived' && (
                  <Popconfirm title="归档后历史归因保留，确认？" onConfirm={() => changeStatus(item, 'archived')}>
                    <Button size="small" danger>归档</Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing === 'new' ? '新建 Campaign' : `编辑 ${editing && editing.code}`}
        open={Boolean(editing)}
        onCancel={() => {
          setEditing(null);
          form.resetFields();
        }}
        onOk={submit}
        width={640}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          {editing === 'new' && (
            <Form.Item
              name="code"
              label="Campaign Code"
              extra="6-32 位小写字母/数字/短横线，创建后不可修改；不使用手机号/微信号"
              rules={[
                { required: true, message: '请填写 code' },
                { pattern: /^[a-z0-9-]{6,32}$/, message: '6-32 位小写字母、数字或短横线' },
              ]}
            >
              <Input placeholder="gz-club-01" />
            </Form.Item>
          )}
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请填写名称' }]}>
            <Input placeholder="广州晨跑团 · 本周开报" />
          </Form.Item>
          <Form.Item
            name="channelType"
            label="渠道类型"
            rules={[{ required: true, message: '请选择渠道类型' }]}
          >
            <Select
              options={growthCampaignTypeValues.map((v) => ({ value: v, label: channelLabels[v] || v }))}
            />
          </Form.Item>
          <Form.Item
            name="partnerName"
            label="合作方名称"
            extra="仅公开组织或账号名称，不保存私人微信号/手机号"
          >
            <Input placeholder="广州晨跑团" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={statsFor ? `${statsFor.name} 漏斗` : ''}
        open={Boolean(statsFor)}
        onCancel={() => setStatsFor(null)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <Segmented
          value={statsDays}
          onChange={(v) => setStatsDays(v as 7 | 28)}
          options={[
            { value: 7, label: '近 7 天' },
            { value: 28, label: '近 28 天' },
          ]}
          style={{ marginBottom: 16 }}
        />
        {statsLoading ? (
          <p>加载中…</p>
        ) : stats ? (
          <div className="stat-grid growth-summary">
            <Card title="独立访客">
              <Statistic value={stats.stats.visitors} />
            </Card>
            <Card title="新用户">
              <Statistic value={stats.stats.newUsers} />
            </Card>
            <Card title="雷达浏览">
              <Statistic value={stats.stats.radarVisitors} suffix={` / ${stats.stats.visitors || 0}`} />
            </Card>
            <Card title="查看两场以上">
              <Statistic value={stats.stats.twoPlusVisitors} suffix={` / ${stats.stats.visitors || 0}`} />
            </Card>
            <Card title="设置偏好">
              <Statistic value={stats.stats.prefVisitors} suffix={` / ${stats.stats.visitors || 0}`} />
            </Card>
            <Card title="核心动作">
              <Statistic value={stats.stats.coreActionVisitors} suffix={` (${stats.stats.visitorToCoreRate}%)`} />
            </Card>
            <Card title="分享发起">
              <Statistic value={stats.stats.shareVisitors} />
            </Card>
          </div>
        ) : (
          <p>暂无数据</p>
        )}
      </Modal>
    </main>
  );
}
