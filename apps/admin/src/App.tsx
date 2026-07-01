import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  FileDoneOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  infoStatusLabels,
  publishStatusLabels,
  runJudgementLabels,
  signupStatusLabels,
} from '@worth-running/shared';
import { apiGet, apiSend } from './api';
import { AdminEvent, OperationLog } from './types';

const { Content, Sider } = Layout;
const { TextArea } = Input;

const publishStatusOptions = Object.entries(publishStatusLabels).map(([value, label]) => ({
  value,
  label,
}));
const infoStatusOptions = Object.entries(infoStatusLabels).map(([value, label]) => ({ value, label }));
const signupStatusOptions = Object.entries(signupStatusLabels).map(([value, label]) => ({
  value,
  label,
}));
const runJudgementOptions = Object.entries(runJudgementLabels).map(([value, label]) => ({
  value,
  label,
}));

function Shell() {
  return (
    <Layout className="app-shell">
      <Sider width={220}>
        <div className="app-logo">哪场值得跑后台</div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={[location.pathname.startsWith('/events') ? '/events' : '/workbench']}
          items={[
            {
              key: '/workbench',
              icon: <DashboardOutlined />,
              label: <Link to="/workbench">工作台</Link>,
            },
            {
              key: '/events',
              icon: <DatabaseOutlined />,
              label: <Link to="/events">赛事库</Link>,
            },
          ]}
        />
      </Sider>
      <Layout>
        <Content>
          <Routes>
            <Route path="/" element={<Navigate to="/workbench" replace />} />
            <Route path="/workbench" element={<WorkbenchPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/edit" element={<EventEditPage />} />
            <Route path="/events/edit/:id" element={<EventEditPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

function WorkbenchPage() {
  const [data, setData] = useState<{
    totalEvents: number;
    publishedEvents: number;
    pendingVerifyEvents: number;
    pendingFeedback: number;
    recentLogs: OperationLog[];
  }>();

  useEffect(() => {
    apiGet<typeof data>('/api/admin/dashboard').then(setData).catch(showError);
  }, []);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">工作台</h1>
          <div className="page-subtitle">手动维护赛事、反馈与关键操作记录</div>
        </div>
        <Link to="/events/edit">
          <Button type="primary" icon={<PlusOutlined />}>
            新增赛事
          </Button>
        </Link>
      </div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="AI 整理，仅供参考，报名以官方为准。官方入口统一使用“前往官方确认”。"
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: 16 }}>
          <Card>
            <Statistic title="当前赛事总数" value={data?.totalEvents ?? 0} />
          </Card>
          <Card>
            <Statistic title="已发布赛事数" value={data?.publishedEvents ?? 0} />
          </Card>
          <Card>
            <Statistic title="待核实赛事数" value={data?.pendingVerifyEvents ?? 0} />
          </Card>
          <Card>
            <Statistic title="待处理反馈数" value={data?.pendingFeedback ?? 0} />
          </Card>
        </div>
        <Card title="最近操作记录">
          <Table
            rowKey="id"
            dataSource={data?.recentLogs || []}
            pagination={false}
            columns={[
              { title: '操作', dataIndex: 'action' },
              { title: '对象', dataIndex: 'targetType' },
              { title: '对象 ID', dataIndex: 'targetId' },
              { title: '备注', dataIndex: 'note' },
              {
                title: '时间',
                dataIndex: 'createdAt',
                render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm'),
              },
            ]}
          />
        </Card>
      </Space>
    </main>
  );
}

function EventsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const loadEvents = () => {
    setLoading(true);
    apiGet<{ items: AdminEvent[] }>(`/api/admin/events${query ? `?${query}` : ''}`)
      .then((result) => setEvents(result.items))
      .catch(showError)
      .finally(() => setLoading(false));
  };

  useEffect(loadEvents, [query]);

  const changeStatus = (event: AdminEvent, path: string, title: string) => {
    Modal.confirm({
      title,
      content: `确认对「${event.eventName}」执行该操作？该操作会写入操作日志。`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        await apiSend('PATCH', `/api/admin/events/${event.id}/${path}`, { note: title });
        message.success('操作成功');
        loadEvents();
      },
    });
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">赛事库</h1>
          <div className="page-subtitle">维护赛事基础信息、发布状态与可信度</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/events/edit')}>
          新增赛事
        </Button>
      </div>
      <div className="toolbar">
        <Input
          placeholder="搜索赛事名称"
          allowClear
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        />
        <Input
          placeholder="城市"
          allowClear
          onChange={(event) => setFilters({ ...filters, city: event.target.value })}
        />
        <Select
          placeholder="报名状态"
          allowClear
          options={signupStatusOptions}
          onChange={(value) => setFilters({ ...filters, signupStatus: value })}
        />
        <Select
          placeholder="发布状态"
          allowClear
          options={publishStatusOptions}
          onChange={(value) => setFilters({ ...filters, publishStatus: value })}
        />
        <Select
          placeholder="信息状态"
          allowClear
          options={infoStatusOptions}
          onChange={(value) => setFilters({ ...filters, infoStatus: value })}
        />
        <Select
          placeholder="跑前判断"
          allowClear
          options={runJudgementOptions}
          onChange={(value) => setFilters({ ...filters, runJudgement: value })}
        />
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={events}
        scroll={{ x: 1300 }}
        columns={[
          { title: '赛事名称', dataIndex: 'eventName', fixed: 'left', width: 210 },
          { title: '城市', dataIndex: 'city', width: 90 },
          {
            title: '比赛日期',
            dataIndex: 'eventDate',
            width: 120,
            render: (value) => dayjs(value).format('YYYY-MM-DD'),
          },
          {
            title: '距离项目',
            dataIndex: 'distanceItems',
            width: 150,
            render: (items: string[]) => items.join(' / '),
          },
          {
            title: '报名状态',
            dataIndex: 'signupStatus',
            width: 110,
            render: (value) => signupStatusLabels[value as keyof typeof signupStatusLabels],
          },
          {
            title: '发布状态',
            dataIndex: 'publishStatus',
            width: 110,
            render: (value) => <Tag>{publishStatusLabels[value as keyof typeof publishStatusLabels]}</Tag>,
          },
          {
            title: '信息状态',
            dataIndex: 'infoStatus',
            width: 110,
            render: (value) => infoStatusLabels[value as keyof typeof infoStatusLabels],
          },
          {
            title: '跑前判断',
            dataIndex: 'runJudgement',
            width: 140,
            render: (value) => runJudgementLabels[value as keyof typeof runJudgementLabels],
          },
          { title: '来源等级', dataIndex: 'sourceLevel', width: 110 },
          {
            title: '更新时间',
            dataIndex: 'updatedAt',
            width: 150,
            render: (value) => dayjs(value).format('MM-DD HH:mm'),
          },
          {
            title: '操作',
            fixed: 'right',
            width: 280,
            render: (_, record) => (
              <Space wrap>
                <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/events/edit/${record.id}`)}>
                  编辑
                </Button>
                <Button size="small" icon={<FileDoneOutlined />} onClick={() => changeStatus(record, 'publish', '发布赛事')}>
                  发布
                </Button>
                <Button size="small" icon={<EyeInvisibleOutlined />} onClick={() => changeStatus(record, 'hide', '前端隐藏')}>
                  隐藏
                </Button>
                <Button size="small" icon={<StopOutlined />} onClick={() => changeStatus(record, 'offline', '临时下架')}>
                  下架
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </main>
  );
}

function EventEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiGet<AdminEvent>(`/api/admin/events/${id}`)
      .then((event) => {
        form.setFieldsValue({
          ...event,
          eventDate: event.eventDate ? dayjs(event.eventDate).format('YYYY-MM-DD') : undefined,
          signupStartAt: event.signupStartAt ? dayjs(event.signupStartAt).format('YYYY-MM-DDTHH:mm') : undefined,
          signupDeadline: event.signupDeadline ? dayjs(event.signupDeadline).format('YYYY-MM-DDTHH:mm') : undefined,
          distanceItems: event.distanceItems.join(', '),
          judgementReasons: event.judgementReasons.join('\n'),
          suitableFor: event.suitableFor.join('\n'),
          notSuitableFor: event.notSuitableFor.join('\n'),
          tags: event.tags.join(', '),
        });
      })
      .catch(showError);
  }, [form, id]);

  const submit = async () => {
    const values = await form.validateFields();
    const body = {
      ...values,
      distanceItems: splitComma(values.distanceItems),
      judgementReasons: splitLines(values.judgementReasons),
      suitableFor: splitLines(values.suitableFor),
      notSuitableFor: splitLines(values.notSuitableFor),
      tags: splitComma(values.tags),
      checklistItems: defaultChecklist(values),
      eventTags: splitComma(values.tags).map((tagName) => ({ tagName, tagType: 'experience' })),
      fieldConfidence: {
        signupDeadline: values.signupDeadline ? 'verified' : 'pending_verify',
        route: 'pending_verify',
        weather: 'pending_verify',
      },
    };
    setLoading(true);
    try {
      if (id) {
        await apiSend('PUT', `/api/admin/events/${id}`, body);
      } else {
        await apiSend('POST', '/api/admin/events', body);
      }
      message.success('保存成功');
      navigate('/events');
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{id ? '编辑赛事' : '新增赛事'}</h1>
          <div className="page-subtitle">所有赛事信息必须保留“AI 整理，仅供参考，报名以官方为准”提示</div>
        </div>
        <Space>
          <Button onClick={() => navigate('/events')}>返回</Button>
          <Button type="primary" loading={loading} onClick={submit}>
            保存
          </Button>
        </Space>
      </div>
      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            signupStatus: 'unknown',
            publishStatus: 'draft',
            infoStatus: 'pending_verify',
            runJudgement: 'unverified',
            sourceLevel: 'official',
          }}
        >
          <Tabs
            items={[
              {
                key: 'base',
                label: '基础信息',
                children: (
                  <>
                    <Section title="基础信息">
                      <div className="form-grid">
                        <Form.Item label="赛事名称" name="eventName" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                        <Form.Item label="城市" name="city" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                        <Form.Item label="比赛日期" name="eventDate" rules={[{ required: true }]}>
                          <Input type="date" />
                        </Form.Item>
                        <Form.Item label="距离项目" name="distanceItems" rules={[{ required: true }]}>
                          <Input placeholder="半马, 10K" />
                        </Form.Item>
                        <Form.Item label="起点" name="startPoint">
                          <Input />
                        </Form.Item>
                        <Form.Item label="终点" name="endPoint">
                          <Input />
                        </Form.Item>
                      </div>
                    </Section>
                    <Section title="报名信息">
                      <div className="form-grid">
                        <Form.Item label="报名状态" name="signupStatus" rules={[{ required: true }]}>
                          <Select options={signupStatusOptions} />
                        </Form.Item>
                        <Form.Item label="报名开始时间" name="signupStartAt">
                          <Input type="datetime-local" />
                        </Form.Item>
                        <Form.Item label="报名截止时间" name="signupDeadline">
                          <Input type="datetime-local" />
                        </Form.Item>
                        <Form.Item label="官方入口" name="officialUrl" rules={[{ required: true }]}>
                          <Input placeholder="前往官方确认" />
                        </Form.Item>
                      </div>
                    </Section>
                  </>
                ),
              },
              {
                key: 'judgement',
                label: '跑前判断',
                children: (
                  <>
                    <Section title="跑前判断">
                      <Form.Item label="跑前判断" name="runJudgement" rules={[{ required: true }]}>
                        <Select options={runJudgementOptions} />
                      </Form.Item>
                      <Form.Item label="一句话判断" name="judgementSummary">
                        <Input />
                      </Form.Item>
                      <Form.Item label="判断理由" name="judgementReasons">
                        <TextArea rows={4} placeholder="每行一条" />
                      </Form.Item>
                      <Form.Item label="适合谁" name="suitableFor">
                        <TextArea rows={3} placeholder="每行一条" />
                      </Form.Item>
                      <Form.Item label="不太适合谁" name="notSuitableFor">
                        <TextArea rows={3} placeholder="每行一条" />
                      </Form.Item>
                    </Section>
                  </>
                ),
              },
              {
                key: 'source',
                label: '来源与发布',
                children: (
                  <>
                    <Section title="标签与体验">
                      <Form.Item label="标签" name="tags">
                        <Input placeholder="新手友好, 适合 PB, 交通方便" />
                      </Form.Item>
                    </Section>
                    <Section title="来源与可信度">
                      <div className="form-grid">
                        <Form.Item label="来源名称" name="sourceName" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                        <Form.Item label="来源链接" name="sourceUrl">
                          <Input />
                        </Form.Item>
                        <Form.Item label="来源等级" name="sourceLevel" rules={[{ required: true }]}>
                          <Select
                            options={[
                              { value: 'official', label: '官方来源' },
                              { value: 'trusted', label: '可信来源' },
                              { value: 'secondary', label: '二级来源' },
                              { value: 'unknown', label: '待核实' },
                            ]}
                          />
                        </Form.Item>
                        <Form.Item label="信息状态" name="infoStatus" rules={[{ required: true }]}>
                          <Select options={infoStatusOptions} />
                        </Form.Item>
                      </div>
                    </Section>
                    <Section title="发布状态">
                      <Form.Item label="发布状态" name="publishStatus" rules={[{ required: true }]}>
                        <Select options={publishStatusOptions} />
                      </Form.Item>
                    </Section>
                    <Descriptions bordered size="small">
                      <Descriptions.Item label="合规提示">
                        <span className="notice-line">AI 整理，仅供参考，报名以官方为准。</span>
                      </Descriptions.Item>
                      <Descriptions.Item label="官方入口文案">前往官方确认</Descriptions.Item>
                    </Descriptions>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Card>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function defaultChecklist(values: Record<string, string>) {
  const items = [
    ['报名信息', '报名截止', values.signupDeadline ? 'verified' : 'pending_verify'],
    ['报名信息', '是否抽签', 'pending_verify'],
    ['赛事规则', '关门时间', 'pending_verify'],
    ['赛事服务', '领物时间', 'pending_verify'],
    ['路线信息', '官方路线', 'pending_verify'],
    ['风险提示', '天气变化', 'pending_verify'],
    ['风险提示', '赛事变更公告', 'pending_verify'],
  ];
  return items.map(([groupName, itemName, itemStatus], index) => ({
    groupName,
    itemName,
    itemStatus,
    sortOrder: index + 1,
  }));
}

function splitComma(value?: string) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value?: string) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function showError(error: unknown) {
  message.error(error instanceof Error ? error.message : '操作失败');
}
