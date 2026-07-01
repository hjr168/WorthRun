import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
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
  LogoutOutlined,
  PlusOutlined,
  ProfileOutlined,
  StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  infoStatusLabels,
  publishStatusLabels,
  runJudgementLabels,
  signupStatusLabels,
} from '@worth-running/shared';
import { apiGet, apiSend, clearToken, getToken, setToken } from './api';
import { AdminEvent, AdminUser, FeedbackItem, OperationLog } from './types';

const { Content, Sider } = Layout;
const { TextArea } = Input;

const publishStatusOptions = Object.entries(publishStatusLabels).map(([value, label]) => ({
  value,
  label,
}));
const infoStatusOptions = Object.entries(infoStatusLabels).map(([value, label]) => ({
  value,
  label,
}));
const signupStatusOptions = Object.entries(signupStatusLabels).map(([value, label]) => ({
  value,
  label,
}));
const runJudgementOptions = Object.entries(runJudgementLabels).map(([value, label]) => ({
  value,
  label,
}));
const sourceLevelOptions = [
  { value: 'official', label: '官方来源' },
  { value: 'trusted', label: '可信来源' },
  { value: 'secondary', label: '二级来源' },
  { value: 'unknown', label: '待核实' },
];
const feedbackStatusOptions = [
  { value: 'pending', label: '待处理' },
  { value: 'handling', label: '处理中' },
  { value: 'resolved', label: '已处理' },
  { value: 'rejected', label: '已驳回' },
];
const riskKeywords = ['取消', '延期', '疑似', '网传', '非官方'];

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedShell />} />
      </Routes>
    </BrowserRouter>
  );
}

function ProtectedShell() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    apiGet<{ admin: AdminUser }>('/api/admin/auth/me')
      .then((result) => setAdmin(result.admin))
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  if (checking) return null;
  if (!getToken()) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <Shell admin={admin} onLogout={() => logout(navigate)} />;
}

function Shell({ admin, onLogout }: { admin: AdminUser | null; onLogout: () => void }) {
  const location = useLocation();
  const selectedKey = location.pathname.startsWith('/events')
    ? '/events'
    : location.pathname.startsWith('/quality')
      ? '/quality'
      : '/workbench';

  return (
    <Layout className="app-shell">
      <Sider width={220}>
        <div className="app-logo">哪场值得跑后台</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
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
            {
              key: '/quality',
              icon: <ProfileOutlined />,
              label: <Link to="/quality">质量反馈</Link>,
            },
          ]}
        />
      </Sider>
      <Layout>
        <div className="topbar">
          <span>{admin?.displayName || '后台用户'}</span>
          <Button icon={<LogoutOutlined />} onClick={onLogout}>
            退出登录
          </Button>
        </div>
        <Content>
          <Routes>
            <Route path="/" element={<Navigate to="/workbench" replace />} />
            <Route path="/workbench" element={<WorkbenchPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/edit" element={<EventEditPage />} />
            <Route path="/events/edit/:id" element={<EventEditPage />} />
            <Route path="/quality" element={<QualityPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const result = await apiSend<{ token: string }>('POST', '/api/admin/auth/login', values);
      setToken(result.token);
      message.success('登录成功');
      navigate((location.state as { from?: string } | null)?.from || '/workbench', {
        replace: true,
      });
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <Card className="login-card" title="哪场值得跑后台登录">
        <Form layout="vertical" initialValues={{ username: 'admin' }} onFinish={submit}>
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            登录
          </Button>
        </Form>
      </Card>
    </main>
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
        <div className="stat-grid">
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
        <OperationLogTable logs={data?.recentLogs || []} />
      </Space>
    </main>
  );
}

function EventsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [logEvent, setLogEvent] = useState<AdminEvent | null>(null);

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
    const publishChecks = path === 'publish' ? buildMiniappPublishChecks({ ...event }) : null;
    Modal.confirm({
      title,
      content: (
        <Space direction="vertical" size={12}>
          <div>确认对「{event.eventName}」执行该操作？该操作会写入操作日志。</div>
          {publishChecks ? (
            <Alert
              type={publishChecks.canPublish ? 'info' : 'warning'}
              showIcon
              message={`小程序发布前检查：${publishChecks.canPublish ? '当前可以发布' : '当前不建议发布'}`}
              description={
                <Space wrap>
                  {publishChecks.checks.map((item) => (
                    <Tag key={item.label} color={item.ok ? 'green' : 'orange'}>
                      {item.label}：{item.ok ? '已具备' : '待补充/需复核'}
                    </Tag>
                  ))}
                </Space>
              }
            />
          ) : null}
        </Space>
      ),
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
        scroll={{ x: 1450 }}
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
            render: (value) => (
              <Tag>{publishStatusLabels[value as keyof typeof publishStatusLabels]}</Tag>
            ),
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
            width: 340,
            render: (_, record) => (
              <Space wrap>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/events/edit/${record.id}`)}
                >
                  编辑
                </Button>
                <Button
                  size="small"
                  icon={<FileDoneOutlined />}
                  onClick={() => changeStatus(record, 'publish', '发布赛事')}
                >
                  发布
                </Button>
                <Button
                  size="small"
                  icon={<EyeInvisibleOutlined />}
                  onClick={() => changeStatus(record, 'hide', '前端隐藏')}
                >
                  隐藏
                </Button>
                <Button
                  size="small"
                  icon={<StopOutlined />}
                  onClick={() => changeStatus(record, 'offline', '临时下架')}
                >
                  下架
                </Button>
                <Button size="small" onClick={() => setLogEvent(record)}>
                  日志
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <EventLogsModal event={logEvent} onClose={() => setLogEvent(null)} />
    </main>
  );
}

function EventEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<OperationLog[]>([]);

  useEffect(() => {
    if (!id) return;
    apiGet<AdminEvent>(`/api/admin/events/${id}`)
      .then((event) => {
        form.setFieldsValue({
          ...event,
          eventDate: event.eventDate ? dayjs(event.eventDate).format('YYYY-MM-DD') : undefined,
          signupStartAt: event.signupStartAt
            ? dayjs(event.signupStartAt).format('YYYY-MM-DDTHH:mm')
            : undefined,
          signupDeadline: event.signupDeadline
            ? dayjs(event.signupDeadline).format('YYYY-MM-DDTHH:mm')
            : undefined,
          distanceItems: event.distanceItems.join(', '),
          judgementReasons: event.judgementReasons.join('\n'),
          suitableFor: event.suitableFor.join('\n'),
          notSuitableFor: event.notSuitableFor.join('\n'),
          tags: event.tags.join(', '),
          checklistItems: event.checklistItems,
        });
      })
      .catch(showError);
    apiGet<{ items: OperationLog[] }>(`/api/admin/operation-logs?targetType=events&targetId=${id}`)
      .then((result) => setLogs(result.items))
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
      checklistItems: values.checklistItems || [],
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
          <div className="page-subtitle">
            所有赛事信息必须保留“AI 整理，仅供参考，报名以官方为准”提示
          </div>
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
            checklistItems: defaultChecklist(),
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
                        <Form.Item
                          label="距离项目"
                          name="distanceItems"
                          rules={[{ required: true }]}
                        >
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
                        <Form.Item
                          label="报名状态"
                          name="signupStatus"
                          rules={[{ required: true }]}
                        >
                          <Select options={signupStatusOptions} />
                        </Form.Item>
                        <Form.Item label="报名开始时间" name="signupStartAt">
                          <Input type="datetime-local" />
                        </Form.Item>
                        <Form.Item label="报名截止时间" name="signupDeadline">
                          <Input type="datetime-local" />
                        </Form.Item>
                        <Form.Item label="官方入口" name="officialUrl" rules={[{ required: true }]}>
                          <Input placeholder="https://example.com" />
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
                ),
              },
              {
                key: 'checklist',
                label: '报名前确认清单',
                children: <ChecklistEditor />,
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
                          <Select options={sourceLevelOptions} />
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
                    <Form.Item shouldUpdate noStyle>
                      {() => <MiniappPublishChecks values={form.getFieldsValue(true)} />}
                    </Form.Item>
                  </>
                ),
              },
              ...(id
                ? [
                    {
                      key: 'logs',
                      label: '操作日志',
                      children: <OperationLogTable logs={logs} />,
                    },
                  ]
                : []),
            ]}
          />
        </Form>
      </Card>
    </main>
  );
}

function ChecklistEditor() {
  return (
    <Section title="报名前确认清单">
      <Form.List name="checklistItems">
        {(fields, { add, remove }) => (
          <Space direction="vertical" style={{ width: '100%' }}>
            {fields.map((field) => (
              <div className="checklist-row" key={field.key}>
                <Form.Item
                  {...field}
                  label="分组"
                  name={[field.name, 'groupName']}
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  {...field}
                  label="确认项"
                  name={[field.name, 'itemName']}
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  {...field}
                  label="状态"
                  name={[field.name, 'itemStatus']}
                  rules={[{ required: true }]}
                >
                  <Select options={infoStatusOptions} />
                </Form.Item>
                <Form.Item {...field} label="说明" name={[field.name, 'description']}>
                  <Input />
                </Form.Item>
                <Form.Item {...field} label="排序" name={[field.name, 'sortOrder']}>
                  <InputNumber min={0} />
                </Form.Item>
                <Button danger onClick={() => remove(field.name)}>
                  删除
                </Button>
              </div>
            ))}
            <Button
              icon={<PlusOutlined />}
              onClick={() => add({ itemStatus: 'pending_verify', sortOrder: fields.length + 1 })}
            >
              新增确认项
            </Button>
          </Space>
        )}
      </Form.List>
    </Section>
  );
}

function MiniappPublishChecks({ values }: { values: Record<string, unknown> }) {
  const { checks, canPublish } = buildMiniappPublishChecks(values);

  return (
    <Card size="small" className="miniapp-check-card" title="小程序发布前检查">
      <Space direction="vertical" size={8}>
        <Alert
          type="info"
          showIcon
          message="仅作为人工运营发布前提示，不替代后端发布校验，不会自动发布。"
        />
        <Space wrap>
          {checks.map((item) => (
            <Tag key={item.label} color={item.ok ? 'green' : 'orange'}>
              {item.label}：{item.ok ? '已具备' : '待补充/需复核'}
            </Tag>
          ))}
          <Tag color={canPublish ? 'green' : 'red'}>
            当前是否可发布：{canPublish ? '可以' : '不建议'}
          </Tag>
        </Space>
      </Space>
    </Card>
  );
}

function buildMiniappPublishChecks(values: Record<string, unknown>) {
  const judgementReasons = toTextList(values.judgementReasons);
  const checklistItems = Array.isArray(values.checklistItems) ? values.checklistItems : [];
  const textForRiskCheck = [
    values.eventName,
    values.officialUrl,
    values.sourceName,
    values.sourceUrl,
    values.judgementSummary,
    judgementReasons.join(' '),
    toTextList(values.tags).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
  const matchedRiskKeywords = riskKeywords.filter((keyword) => textForRiskCheck.includes(keyword));
  const checks = [
    { label: '官方入口', ok: Boolean(values.officialUrl) },
    { label: '来源名称', ok: Boolean(values.sourceName) },
    { label: '跑前判断', ok: Boolean(values.runJudgement) },
    { label: '至少 1 条判断理由', ok: judgementReasons.length > 0 },
    { label: '确认清单', ok: checklistItems.length > 0 },
    { label: '合规提示', ok: true },
    {
      label: matchedRiskKeywords.length ? `风险词：${matchedRiskKeywords.join('、')}` : '风险词',
      ok: matchedRiskKeywords.length === 0,
    },
  ];
  const canPublish = checks.every((item) => item.ok);

  return { checks, canPublish };
}

function QualityPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [status, setStatus] = useState<string>();

  const load = () => {
    apiGet<{ items: FeedbackItem[] }>(`/api/admin/feedback${status ? `?status=${status}` : ''}`)
      .then((result) => setItems(result.items))
      .catch(showError);
  };

  useEffect(load, [status]);

  const handleFeedback = (feedback: FeedbackItem, nextStatus: 'resolved' | 'rejected') => {
    let note = '';
    Modal.confirm({
      title: nextStatus === 'resolved' ? '标记已处理' : '标记驳回',
      content: (
        <Input.TextArea
          rows={4}
          placeholder="处理备注"
          onChange={(event) => {
            note = event.target.value;
          }}
        />
      ),
      onOk: async () => {
        await apiSend('PATCH', `/api/admin/feedback/${feedback.id}/handle`, {
          status: nextStatus,
          adminNote: note,
        });
        message.success('反馈已更新');
        load();
      },
    });
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">质量与反馈</h1>
          <div className="page-subtitle">处理用户纠错反馈，关键处理动作会写入操作日志</div>
        </div>
        <Select
          allowClear
          placeholder="反馈状态"
          style={{ width: 180 }}
          options={feedbackStatusOptions}
          onChange={setStatus}
        />
      </div>
      <Table
        rowKey="id"
        dataSource={items}
        columns={[
          { title: '反馈类型', dataIndex: 'feedbackType', width: 130 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (value) =>
              feedbackStatusOptions.find((item) => item.value === value)?.label || value,
          },
          {
            title: '关联赛事',
            dataIndex: 'event',
            width: 220,
            render: (event) =>
              event ? (
                <Button type="link" onClick={() => navigate(`/events/edit/${event.id}`)}>
                  {event.eventName}
                </Button>
              ) : (
                '-'
              ),
          },
          { title: '反馈内容', dataIndex: 'content' },
          { title: '处理备注', dataIndex: 'adminNote' },
          {
            title: '提交时间',
            dataIndex: 'createdAt',
            width: 150,
            render: (value) => dayjs(value).format('MM-DD HH:mm'),
          },
          {
            title: '操作',
            width: 180,
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => handleFeedback(record, 'resolved')}>
                  已处理
                </Button>
                <Button size="small" danger onClick={() => handleFeedback(record, 'rejected')}>
                  驳回
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </main>
  );
}

function OperationLogTable({ logs }: { logs: OperationLog[] }) {
  return (
    <Card title="操作记录">
      <Table
        rowKey="id"
        dataSource={logs}
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
  );
}

function EventLogsModal({ event, onClose }: { event: AdminEvent | null; onClose: () => void }) {
  const [logs, setLogs] = useState<OperationLog[]>([]);

  useEffect(() => {
    if (!event) return;
    apiGet<{ items: OperationLog[] }>(
      `/api/admin/operation-logs?targetType=events&targetId=${event.id}`,
    )
      .then((result) => setLogs(result.items))
      .catch(showError);
  }, [event]);

  return (
    <Modal
      title={event ? `${event.eventName} 操作日志` : '操作日志'}
      open={!!event}
      onCancel={onClose}
      footer={null}
      width={860}
    >
      <OperationLogTable logs={logs} />
    </Modal>
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

function defaultChecklist() {
  return [
    ['报名信息', '报名截止', 'pending_verify'],
    ['报名信息', '是否抽签', 'pending_verify'],
    ['赛事规则', '关门时间', 'pending_verify'],
    ['赛事服务', '领物时间', 'pending_verify'],
    ['路线信息', '官方路线', 'pending_verify'],
    ['风险提示', '天气变化', 'pending_verify'],
    ['风险提示', '赛事变更公告', 'pending_verify'],
  ].map(([groupName, itemName, itemStatus], index) => ({
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

function toTextList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function logout(navigate: ReturnType<typeof useNavigate>) {
  clearToken();
  navigate('/login', { replace: true });
}

function showError(error: unknown) {
  message.error(error instanceof Error ? error.message : '操作失败');
}
