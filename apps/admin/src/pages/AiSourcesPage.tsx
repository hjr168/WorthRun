import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../api';
import { runJudgementOptions, signupStatusOptions, sourceLevelOptions } from '../constants';
import { useAdmin } from '../context/AdminContext';
import {
  CandidateReviewIssue,
  EventCandidateItem,
  EventCandidateStats,
  EventSourceItem,
  EventSourceRunItem,
  EventSourceRunSummary,
} from '../types';
import {
  candidateIssueLabel,
  formatEventSourceRunSummary,
  formatRunDuration,
  formatRunPageRange,
  formatScheduleInterval,
  runStatusLabel,
} from '../utils/aiSources';
import { showError } from '../utils/helpers';

const sourceTypeOptions = [
  { value: 'page_url', label: '网页 AI 抽取' },
  { value: 'chinaath_api', label: '中国田协官方赛事目录' },
];

const sourceTypeLabels: Record<EventSourceItem['sourceType'], string> = {
  page_url: '网页 AI 抽取',
  chinaath_api: '中国田协目录',
  search_query: '搜索关键词',
  rss: 'RSS',
};

const sourceStatusLabels: Record<EventSourceItem['status'], string> = {
  active: '启用',
  paused: '暂停',
};

const candidateStatusLabels: Record<EventCandidateItem['status'], string> = {
  new: '新候选',
  needs_review: '待复核',
  accepted: '已采纳',
  rejected: '已驳回',
  merged: '已合并',
};

interface SourceFormValues {
  name: string;
  sourceType: EventSourceItem['sourceType'];
  entryUrl?: string;
  searchQuery?: string;
  allowedDomains?: string;
  cityHints?: string;
  status: EventSourceItem['status'];
  scheduleEnabled: boolean;
  scheduleIntervalHours: number;
  pageSize: number;
  maxPagesPerRun: number;
  notes?: string;
}

interface CandidateFormValues {
  eventName: string;
  city: string;
  eventDate: string;
  distanceItems?: string;
  signupStatus: string;
  signupDeadline?: string;
  officialUrl: string;
  sourceName: string;
  sourceUrl: string;
  sourceLevel: string;
  runJudgement: string;
  judgementSummary?: string;
  judgementReasons?: string;
  tags?: string;
  evidenceQuote: string;
}

export function AiSourcesPage() {
  const navigate = useNavigate();
  const { can } = useAdmin();
  const [sourceForm] = Form.useForm<SourceFormValues>();
  const [candidateForm] = Form.useForm<CandidateFormValues>();
  const selectedSourceType = Form.useWatch('sourceType', sourceForm) || 'page_url';
  const scheduleEnabled = Form.useWatch('scheduleEnabled', sourceForm);
  const [sources, setSources] = useState<EventSourceItem[]>([]);
  const [candidates, setCandidates] = useState<EventCandidateItem[]>([]);
  const [candidateStats, setCandidateStats] = useState<EventCandidateStats>({
    pending: 0,
    urgent: 0,
    missingOfficialUrl: 0,
    duplicates: 0,
  });
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidatePageSize, setCandidatePageSize] = useState(20);
  const [candidateIssue, setCandidateIssue] = useState('');
  const [candidateSort, setCandidateSort] = useState<'priority' | 'newest'>('priority');
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<EventSourceItem | null>(null);
  const [historySource, setHistorySource] = useState<EventSourceItem | null>(null);
  const [sourceRuns, setSourceRuns] = useState<EventSourceRunItem[]>([]);
  const [sourceRunTotal, setSourceRunTotal] = useState(0);
  const [sourceRunPage, setSourceRunPage] = useState(1);
  const [sourceRunsLoading, setSourceRunsLoading] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<EventCandidateItem | null>(null);
  const [savingSource, setSavingSource] = useState(false);
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
  const [candidateSourceId, setCandidateSourceId] = useState<string>('');
  const [candidateStatus, setCandidateStatus] = useState<string>('');

  const loadSources = () => {
    setSourcesLoading(true);
    return apiGet<{ items: EventSourceItem[] }>('/api/admin/event-sources')
      .then((result) => setSources(result.items))
      .catch(showError)
      .finally(() => setSourcesLoading(false));
  };

  const loadCandidates = () => {
    setCandidatesLoading(true);
    const params = new URLSearchParams();
    if (candidateSourceId) params.set('sourceId', candidateSourceId);
    if (candidateStatus) params.set('status', candidateStatus);
    if (candidateIssue) params.set('issue', candidateIssue);
    params.set('sort', candidateSort);
    params.set('page', String(candidatePage));
    params.set('pageSize', String(candidatePageSize));
    const query = params.toString();
    return apiGet<{ items: EventCandidateItem[]; total: number }>(
      `/api/admin/event-candidates${query ? `?${query}` : ''}`,
    )
      .then((result) => {
        setCandidates(result.items);
        setCandidateTotal(result.total);
      })
      .catch(showError)
      .finally(() => setCandidatesLoading(false));
  };

  const loadCandidateStats = () => {
    const query = candidateSourceId ? `?sourceId=${encodeURIComponent(candidateSourceId)}` : '';
    return apiGet<EventCandidateStats>(`/api/admin/event-candidate-stats${query}`)
      .then(setCandidateStats)
      .catch(showError);
  };

  const loadSourceRuns = (source: EventSourceItem, page = sourceRunPage) => {
    setSourceRunsLoading(true);
    return apiGet<{ items: EventSourceRunItem[]; total: number }>(
      `/api/admin/event-source-runs?sourceId=${encodeURIComponent(source.id)}&page=${page}&pageSize=10`,
    )
      .then((result) => {
        setSourceRuns(result.items);
        setSourceRunTotal(result.total);
      })
      .catch(showError)
      .finally(() => setSourceRunsLoading(false));
  };

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    void Promise.all([loadCandidates(), loadCandidateStats()]);
  }, [
    candidateSourceId,
    candidateStatus,
    candidateIssue,
    candidateSort,
    candidatePage,
    candidatePageSize,
  ]);

  const saveSource = async () => {
    try {
      const values = await sourceForm.validateFields();
      setSavingSource(true);
      const payload = {
        name: values.name,
        sourceType: values.sourceType,
        entryUrl: normalizeOptionalString(values.entryUrl),
        searchQuery: normalizeOptionalString(values.searchQuery),
        allowedDomains: splitList(values.allowedDomains),
        cityHints: splitList(values.cityHints),
        status: values.status,
        scheduleEnabled: values.scheduleEnabled,
        scheduleIntervalHours: values.scheduleIntervalHours,
        pageSize: values.pageSize,
        maxPagesPerRun: values.maxPagesPerRun,
        notes: normalizeOptionalString(values.notes),
      };
      await apiSend(
        editingSource ? 'PUT' : 'POST',
        editingSource ? `/api/admin/event-sources/${editingSource.id}` : '/api/admin/event-sources',
        payload,
      );
      message.success(editingSource ? '赛事源已更新' : '赛事源已创建');
      setSourceModalOpen(false);
      setEditingSource(null);
      sourceForm.resetFields();
      await loadSources();
    } catch (error) {
      showError(error);
    } finally {
      setSavingSource(false);
    }
  };

  const openSourceEditor = (source?: EventSourceItem) => {
    setEditingSource(source || null);
    sourceForm.setFieldsValue(
      source
        ? {
            name: source.name,
            sourceType: source.sourceType,
            entryUrl: source.entryUrl || '',
            searchQuery: source.searchQuery || '',
            allowedDomains: joinList(source.allowedDomains),
            cityHints: joinList(source.cityHints),
            status: source.status,
            scheduleEnabled: source.scheduleEnabled,
            scheduleIntervalHours: source.scheduleIntervalHours,
            pageSize: source.pageSize,
            maxPagesPerRun: source.maxPagesPerRun,
            notes: source.notes || '',
          }
        : {
            sourceType: 'page_url',
            status: 'active',
            scheduleEnabled: false,
            scheduleIntervalHours: 24,
            pageSize: 20,
            maxPagesPerRun: 1,
          },
    );
    setSourceModalOpen(true);
  };

  const openRunHistory = (source: EventSourceItem) => {
    setHistorySource(source);
    setSourceRunPage(1);
    void loadSourceRuns(source, 1);
  };

  const runSource = async (source: EventSourceItem) => {
    try {
      setRunningSourceId(source.id);
      const summary = await apiSend<EventSourceRunSummary>(
        'POST',
        `/api/admin/event-sources/${source.id}/run`,
        {},
      );
      message.success(formatEventSourceRunSummary(summary));
    } catch (error) {
      showError(error);
    } finally {
      setRunningSourceId(null);
      await Promise.all([loadSources(), loadCandidates(), loadCandidateStats()]);
    }
  };

  const openCandidateEditor = (candidate: EventCandidateItem) => {
    const extractedData = candidate.extractedData || {};
    const evidence = getEvidence(candidate);
    const firstEvidence = evidence[0];

    setEditingCandidate(candidate);
    candidateForm.setFieldsValue({
      eventName: readString(extractedData, 'eventName') || candidate.eventName,
      city: readString(extractedData, 'city') || candidate.city,
      eventDate: formatDateInput(readString(extractedData, 'eventDate') || candidate.eventDate),
      distanceItems: joinList(readStringArray(extractedData, 'distanceItems')),
      signupStatus: readString(extractedData, 'signupStatus') || 'unknown',
      signupDeadline: readString(extractedData, 'signupDeadline') || '',
      officialUrl: readString(extractedData, 'officialUrl') || candidate.officialUrl || '',
      sourceName:
        readString(extractedData, 'sourceName') || candidate.source?.name || 'AI 辅助抽取',
      sourceUrl:
        readString(extractedData, 'sourceUrl') ||
        candidate.sourceUrl ||
        firstEvidence?.sourceUrl ||
        '',
      sourceLevel: readString(extractedData, 'sourceLevel') || 'unknown',
      runJudgement: readString(extractedData, 'runJudgement') || 'unverified',
      judgementSummary: readString(extractedData, 'judgementSummary') || '',
      judgementReasons: joinList(readStringArray(extractedData, 'judgementReasons')),
      tags: joinList(readStringArray(extractedData, 'tags')),
      evidenceQuote: firstEvidence?.quote || '',
    });
  };

  const saveCandidate = async () => {
    if (!editingCandidate) return;
    try {
      const values = await candidateForm.validateFields();
      setSavingCandidate(true);
      await apiSend('PUT', `/api/admin/event-candidates/${editingCandidate.id}`, {
        extractedData: buildExtractedData(editingCandidate, values),
      });
      message.success('候选赛事已保存');
      setEditingCandidate(null);
      candidateForm.resetFields();
      await Promise.all([loadCandidates(), loadCandidateStats()]);
    } catch (error) {
      showError(error);
    } finally {
      setSavingCandidate(false);
    }
  };

  const reviewCandidate = async (candidate: EventCandidateItem, action: 'accept' | 'reject') => {
    if (action === 'accept') {
      if (!candidate.officialUrl && !readString(candidate.extractedData, 'officialUrl')) {
        message.warning('AI 未识别到官方入口，请人工补充后再采纳。');
        openCandidateEditor(candidate);
        return;
      }
      if (!candidate.sourceUrl && !readString(candidate.extractedData, 'sourceUrl')) {
        message.warning('候选赛事缺少来源链接，请先人工补充后再采纳。');
        openCandidateEditor(candidate);
        return;
      }
      if (!candidate.eventDate && !readString(candidate.extractedData, 'eventDate')) {
        message.warning('候选赛事缺少比赛日期，请先人工补充后再采纳。');
        openCandidateEditor(candidate);
        return;
      }

      try {
        const result = await apiSend<{ event?: { id: string } }>(
          'POST',
          `/api/admin/event-candidates/${candidate.id}/review`,
          { action },
        );
        message.success('已采纳为赛事草稿，请继续人工核验和补充');
        if (result.event?.id) navigate(`/events/edit/${result.event.id}`);
        else await Promise.all([loadCandidates(), loadCandidateStats()]);
      } catch (error) {
        showError(error);
      }
      return;
    }

    let rejectReason = '';
    Modal.confirm({
      title: '驳回候选赛事',
      content: (
        <Input.TextArea
          rows={4}
          placeholder="驳回原因，可选"
          onChange={(event) => {
            rejectReason = event.target.value;
          }}
        />
      ),
      okText: '确认驳回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await apiSend('POST', `/api/admin/event-candidates/${candidate.id}/review`, {
            action,
            rejectReason: normalizeOptionalString(rejectReason),
          });
          message.success('候选赛事已驳回');
          await Promise.all([loadCandidates(), loadCandidateStats()]);
        } catch (error) {
          showError(error);
        }
      },
    });
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI 赛事源</h1>
          <div className="page-subtitle">AI 只生成候选草稿，发布前必须人工核验和补充。</div>
        </div>
        {can('manage_ai_sources') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openSourceEditor()}>
            新增赛事源
          </Button>
        )}
      </div>

      <Space direction="vertical" size={18} style={{ width: '100%' }}>
        <Alert
          showIcon
          type="warning"
          message="AI 赛事源仅用于生成候选草稿"
          description="候选内容不会自动发布，也不会替代人工核验；采纳后仍需进入赛事草稿继续补充官方入口、来源证据和赛前判断。"
        />

        <section className="form-section">
          <h2>赛事源</h2>
          <Table<EventSourceItem>
            rowKey="id"
            loading={sourcesLoading}
            dataSource={sources}
            pagination={false}
            scroll={{ x: 980 }}
            columns={[
              {
                title: '名称',
                dataIndex: 'name',
                width: 180,
                fixed: 'left',
                render: (value: string, record) => (
                  <Typography.Link onClick={() => openRunHistory(record)}>{value}</Typography.Link>
                ),
              },
              {
                title: '类型',
                dataIndex: 'sourceType',
                width: 140,
                render: (value: EventSourceItem['sourceType']) => sourceTypeLabels[value],
              },
              {
                title: '自动运行',
                width: 140,
                render: (_, record) =>
                  record.scheduleEnabled ? (
                    <Space direction="vertical" size={2}>
                      <Tag color="blue">已开启</Tag>
                      <Typography.Text type="secondary">
                        {formatScheduleInterval(record.scheduleIntervalHours)}
                      </Typography.Text>
                    </Space>
                  ) : (
                    <Tag>未开启</Tag>
                  ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 100,
                render: (value: EventSourceItem['status']) => (
                  <Tag color={value === 'active' ? 'green' : 'default'}>
                    {sourceStatusLabels[value] || value}
                  </Tag>
                ),
              },
              {
                title: '下次运行',
                width: 150,
                render: (_, record) => formatDateTime(record.nextRunAt),
              },
              {
                title: '最近运行',
                width: 210,
                render: (_, record) => (
                  <Space direction="vertical" size={2}>
                    <span>{record.lastRunStatus || '尚未运行'}</span>
                    <Typography.Text type="secondary">
                      {formatDateTime(record.lastRunAt)}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '连续失败',
                dataIndex: 'consecutiveFailures',
                width: 100,
                render: (value: number) => (
                  <Typography.Text type={value ? 'danger' : 'secondary'}>{value}</Typography.Text>
                ),
              },
              {
                title: '操作',
                fixed: 'right',
                width: 250,
                render: (_, record) =>
                  can('manage_ai_sources') ? (
                    <Space>
                      <Button
                        size="small"
                        icon={<RobotOutlined />}
                        loading={runningSourceId === record.id}
                        disabled={
                          record.status !== 'active' ||
                          Boolean(runningSourceId && runningSourceId !== record.id)
                        }
                        onClick={() => runSource(record)}
                      >
                        立即抓取
                      </Button>
                      <Button
                        size="small"
                        icon={<HistoryOutlined />}
                        aria-label="运行历史"
                        title="运行历史"
                        onClick={() => openRunHistory(record)}
                      />
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        aria-label="编辑赛事源"
                        title="编辑赛事源"
                        onClick={() => openSourceEditor(record)}
                      />
                    </Space>
                  ) : (
                    <Button
                      size="small"
                      icon={<HistoryOutlined />}
                      onClick={() => openRunHistory(record)}
                    >
                      运行历史
                    </Button>
                  ),
              },
            ]}
          />
        </section>

        <section className="form-section">
          <div className="section-heading">
            <h2>候选赛事</h2>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => void Promise.all([loadCandidates(), loadCandidateStats()])}
            >
              刷新
            </Button>
          </div>
          <div className="ai-stat-strip">
            <Statistic title="待审核" value={candidateStats.pending} />
            <Statistic title="高优先级" value={candidateStats.urgent} />
            <Statistic title="缺少官方入口" value={candidateStats.missingOfficialUrl} />
            <Statistic title="疑似重复" value={candidateStats.duplicates} />
          </div>
          <Space wrap className="ai-source-filters">
            <Select
              aria-label="候选来源"
              style={{ width: 220 }}
              value={candidateSourceId}
              onChange={(value) => {
                setCandidateSourceId(value);
                setCandidatePage(1);
              }}
              options={[
                { value: '', label: '全部来源' },
                ...sources.map((source) => ({ value: source.id, label: source.name })),
              ]}
            />
            <Select
              aria-label="候选状态"
              style={{ width: 150 }}
              value={candidateStatus}
              onChange={(value) => {
                setCandidateStatus(value);
                setCandidatePage(1);
              }}
              options={[
                { value: '', label: '全部状态' },
                ...Object.entries(candidateStatusLabels).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <Select
              aria-label="候选问题"
              style={{ width: 180 }}
              value={candidateIssue}
              onChange={(value) => {
                setCandidateIssue(value);
                setCandidatePage(1);
              }}
              options={[
                { value: '', label: '全部问题' },
                ...(
                  [
                    'missing_event_date',
                    'missing_official_url',
                    'missing_source_url',
                    'duplicate_event',
                  ] as CandidateReviewIssue[]
                ).map((value) => ({ value, label: candidateIssueLabel(value) })),
              ]}
            />
            <Select
              aria-label="候选排序"
              style={{ width: 150 }}
              value={candidateSort}
              onChange={(value) => {
                setCandidateSort(value);
                setCandidatePage(1);
              }}
              options={[
                { value: 'priority', label: '优先级排序' },
                { value: 'newest', label: '最新创建' },
              ]}
            />
          </Space>
          <Table<EventCandidateItem>
            rowKey="id"
            loading={candidatesLoading}
            dataSource={candidates}
            pagination={{
              current: candidatePage,
              pageSize: candidatePageSize,
              total: candidateTotal,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (page, pageSize) => {
                setCandidatePage(pageSize === candidatePageSize ? page : 1);
                setCandidatePageSize(pageSize);
              },
            }}
            scroll={{ x: 1580 }}
            columns={[
              { title: '赛事', dataIndex: 'eventName', width: 210, fixed: 'left' },
              {
                title: '来源',
                width: 170,
                render: (_, record) => record.source?.name || '-',
              },
              { title: '城市', dataIndex: 'city', width: 100 },
              {
                title: '优先级',
                dataIndex: 'priorityScore',
                width: 90,
                render: (value: number) => (
                  <Tag color={value >= 100 ? 'red' : value >= 80 ? 'orange' : 'default'}>
                    {value}
                  </Tag>
                ),
              },
              {
                title: '日期',
                dataIndex: 'eventDate',
                width: 120,
                render: (value: string | null) => formatDateInput(value) || '待确认',
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 110,
                render: (value: EventCandidateItem['status']) => (
                  <Tag color={candidateStatusColor(value)}>
                    {candidateStatusLabels[value] || value}
                  </Tag>
                ),
              },
              {
                title: '待补充',
                dataIndex: 'reviewIssues',
                width: 240,
                render: (issues: CandidateReviewIssue[]) =>
                  issues.length ? (
                    <Space size={[0, 4]} wrap>
                      {issues.map((issue) => (
                        <Tag key={issue} color={issue === 'duplicate_event' ? 'red' : 'orange'}>
                          {candidateIssueLabel(issue)}
                        </Tag>
                      ))}
                    </Space>
                  ) : (
                    <Tag color="green">信息完整</Tag>
                  ),
              },
              {
                title: '官方入口',
                width: 180,
                render: (_, record) =>
                  renderUrl(readString(record.extractedData, 'officialUrl') || record.officialUrl),
              },
              {
                title: '证据',
                dataIndex: 'evidence',
                width: 340,
                render: (items: EventCandidateItem['evidence']) => renderEvidence(items),
              },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                width: 150,
                render: (value: string) => dayjs(value).format('MM-DD HH:mm'),
              },
              {
                title: '操作',
                fixed: 'right',
                width: 300,
                render: (_, record) =>
                  can('review_ai_candidates') && ['new', 'needs_review'].includes(record.status) ? (
                    <Space wrap>
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openCandidateEditor(record)}
                      >
                        编辑候选
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => reviewCandidate(record, 'accept')}
                      >
                        采纳为草稿
                      </Button>
                      <Button size="small" danger onClick={() => reviewCandidate(record, 'reject')}>
                        驳回
                      </Button>
                    </Space>
                  ) : (
                    '-'
                  ),
              },
            ]}
          />
        </section>
      </Space>

      <Modal
        title={editingSource ? '编辑赛事源' : '新增赛事源'}
        open={sourceModalOpen}
        onOk={saveSource}
        confirmLoading={savingSource}
        onCancel={() => {
          setSourceModalOpen(false);
          setEditingSource(null);
          sourceForm.resetFields();
        }}
        destroyOnHidden
      >
        <Form
          form={sourceForm}
          layout="vertical"
          initialValues={{
            sourceType: 'page_url',
            status: 'active',
            scheduleEnabled: false,
            scheduleIntervalHours: 24,
            pageSize: 20,
            maxPagesPerRun: 1,
          }}
        >
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：广州马拉松官网公告" />
          </Form.Item>
          <Form.Item
            label="类型"
            name="sourceType"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select options={sourceTypeOptions} />
          </Form.Item>
          {selectedSourceType === 'chinaath_api' ? (
            <Alert
              showIcon
              type="info"
              style={{ marginBottom: 16 }}
              message="固定读取中国田协公开赛事目录"
              description="每次最多读取 20 条候选；官方报名入口和报名状态仍需人工补充。"
            />
          ) : (
            <>
              <Form.Item
                label="入口 URL"
                name="entryUrl"
                rules={[{ required: true, message: '请输入入口 URL' }]}
              >
                <Input placeholder="https://..." />
              </Form.Item>
              <Form.Item
                label="允许域名"
                name="allowedDomains"
                extra="多个域名用逗号或换行分隔；留空时使用入口 URL 域名"
              >
                <Input.TextArea rows={2} placeholder="example.com, www.example.com" />
              </Form.Item>
            </>
          )}
          <Form.Item label="城市提示" name="cityHints" extra="多个城市用逗号或换行分隔">
            <Input placeholder="广州, 深圳, 佛山" />
          </Form.Item>
          <div className="form-grid compact-form-grid">
            <Form.Item label="状态" name="status">
              <Select
                options={[
                  { value: 'active', label: '启用' },
                  { value: 'paused', label: '暂停' },
                ]}
              />
            </Form.Item>
            <Form.Item label="自动运行" name="scheduleEnabled" valuePropName="checked">
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item
              label="运行间隔（小时）"
              name="scheduleIntervalHours"
              rules={[{ required: true, message: '请输入运行间隔' }]}
            >
              <InputNumber
                min={1}
                max={168}
                disabled={!scheduleEnabled}
                style={{ width: '100%' }}
              />
            </Form.Item>
            {selectedSourceType === 'chinaath_api' && (
              <>
                <Form.Item label="每页条数" name="pageSize">
                  <InputNumber min={1} max={20} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item label="每次最多页数" name="maxPagesPerRun">
                  <InputNumber min={1} max={2} style={{ width: '100%' }} />
                </Form.Item>
              </>
            )}
          </div>
          <Form.Item label="备注" name="notes">
            <Input.TextArea rows={3} placeholder="只记录后台核验需要的备注" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={historySource ? `${historySource.name} · 运行历史` : '运行历史'}
        open={Boolean(historySource)}
        width="min(940px, 100vw)"
        onClose={() => setHistorySource(null)}
      >
        <Table<EventSourceRunItem>
          rowKey="id"
          size="small"
          loading={sourceRunsLoading}
          dataSource={sourceRuns}
          scroll={{ x: 920 }}
          pagination={{
            current: sourceRunPage,
            pageSize: 10,
            total: sourceRunTotal,
            showSizeChanger: false,
            onChange: (page) => {
              if (!historySource) return;
              setSourceRunPage(page);
              void loadSourceRuns(historySource, page);
            },
          }}
          columns={[
            {
              title: '开始时间',
              dataIndex: 'startedAt',
              width: 145,
              render: formatDateTime,
            },
            {
              title: '触发方式',
              dataIndex: 'trigger',
              width: 90,
              render: (value: EventSourceRunItem['trigger']) =>
                value === 'manual' ? '手动' : '自动',
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (value: EventSourceRunItem['status']) => (
                <Tag color={value === 'succeeded' ? 'green' : value === 'failed' ? 'red' : 'blue'}>
                  {runStatusLabel(value)}
                </Tag>
              ),
            },
            {
              title: '页码',
              width: 100,
              render: (_, record) => formatRunPageRange(record),
            },
            {
              title: '结果',
              width: 220,
              render: (_, record) =>
                `读取 ${record.fetched}，新增 ${record.created}，更新 ${record.updated}`,
            },
            {
              title: '耗时',
              width: 90,
              render: (_, record) => formatRunDuration(record.startedAt, record.finishedAt),
            },
            {
              title: '错误',
              dataIndex: 'errorMessage',
              width: 220,
              render: (value: string | null) => (
                <Typography.Text
                  type={value ? 'danger' : 'secondary'}
                  ellipsis={{ tooltip: value }}
                >
                  {value || '-'}
                </Typography.Text>
              ),
            },
            {
              title: '操作',
              fixed: 'right',
              width: 90,
              render: (_, record) =>
                record.status === 'failed' && historySource && can('manage_ai_sources') ? (
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={runningSourceId === historySource.id}
                    onClick={() => runSource(historySource)}
                  >
                    重试
                  </Button>
                ) : (
                  '-'
                ),
            },
          ]}
        />
      </Drawer>

      <Modal
        title="编辑候选赛事"
        open={Boolean(editingCandidate)}
        width={760}
        styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }}
        onOk={saveCandidate}
        confirmLoading={savingCandidate}
        okText="保存候选"
        onCancel={() => {
          setEditingCandidate(null);
          candidateForm.resetFields();
        }}
        destroyOnHidden
      >
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="补齐官方入口、来源链接和比赛日期后，再采纳为赛事草稿。"
        />
        <Form form={candidateForm} layout="vertical">
          <div className="form-grid">
            <Form.Item
              label="赛事名称"
              name="eventName"
              rules={[{ required: true, message: '请输入赛事名称' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item label="城市" name="city" rules={[{ required: true, message: '请输入城市' }]}>
              <Input />
            </Form.Item>
            <Form.Item
              label="比赛日期"
              name="eventDate"
              rules={[
                { required: true, message: '请输入比赛日期' },
                { pattern: /^\d{4}-\d{2}-\d{2}$/, message: '格式应为 YYYY-MM-DD' },
              ]}
            >
              <Input placeholder="2026-12-20" />
            </Form.Item>
            <Form.Item label="距离项目" name="distanceItems" extra="多个项目用逗号或换行分隔">
              <Input placeholder="全马, 半马, 10K" />
            </Form.Item>
            <Form.Item
              label="官方入口"
              name="officialUrl"
              rules={[
                { required: true, message: '请补充官方入口' },
                { type: 'url', message: '请输入有效 URL' },
              ]}
            >
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item
              label="来源链接"
              name="sourceUrl"
              rules={[
                { required: true, message: '请补充来源链接' },
                { type: 'url', message: '请输入有效 URL' },
              ]}
            >
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item
              label="来源名称"
              name="sourceName"
              rules={[{ required: true, message: '请输入来源名称' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="来源等级"
              name="sourceLevel"
              rules={[{ required: true, message: '请选择来源等级' }]}
            >
              <Select options={sourceLevelOptions} />
            </Form.Item>
            <Form.Item
              label="报名状态"
              name="signupStatus"
              rules={[{ required: true, message: '请选择报名状态' }]}
            >
              <Select options={signupStatusOptions} />
            </Form.Item>
            <Form.Item label="报名截止时间" name="signupDeadline">
              <Input placeholder="2026-09-01T23:59:59.000Z" />
            </Form.Item>
            <Form.Item
              label="跑前判断"
              name="runJudgement"
              rules={[{ required: true, message: '请选择跑前判断' }]}
            >
              <Select options={runJudgementOptions} />
            </Form.Item>
            <Form.Item label="标签" name="tags" extra="多个标签用逗号或换行分隔">
              <Input />
            </Form.Item>
          </div>
          <Form.Item label="一句话判断" name="judgementSummary">
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <Form.Item label="判断理由" name="judgementReasons" extra="多个理由用逗号或换行分隔">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            label="证据摘录"
            name="evidenceQuote"
            rules={[{ required: true, message: '请保留至少一条证据摘录' }]}
          >
            <Input.TextArea rows={3} maxLength={300} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}

function buildExtractedData(candidate: EventCandidateItem, values: CandidateFormValues) {
  const base = candidate.extractedData || {};
  const firstEvidence = getEvidence(candidate)[0];
  const sourceUrl = values.sourceUrl.trim();
  const evidence = [
    {
      field: firstEvidence?.field || 'eventName',
      sourceUrl,
      quote: values.evidenceQuote.trim(),
    },
    ...getEvidence(candidate).slice(1),
  ];

  return {
    ...base,
    eventName: values.eventName.trim(),
    city: values.city.trim(),
    eventDate: values.eventDate.trim(),
    distanceItems: splitList(values.distanceItems),
    signupStatus: values.signupStatus,
    signupDeadline: normalizeOptionalString(values.signupDeadline),
    officialUrl: values.officialUrl.trim(),
    sourceName: values.sourceName.trim(),
    sourceUrl,
    sourceLevel: values.sourceLevel,
    runJudgement: values.runJudgement,
    judgementSummary: values.judgementSummary?.trim() || '',
    judgementReasons: splitList(values.judgementReasons),
    suitableFor: readStringArray(base, 'suitableFor'),
    notSuitableFor: readStringArray(base, 'notSuitableFor'),
    tags: splitList(values.tags),
    evidence,
    confidence: readRecord(base, 'confidence'),
  };
}

function renderUrl(url?: string | null) {
  if (!url) return '-';
  return (
    <Typography.Link href={url} target="_blank" rel="noreferrer">
      {url}
    </Typography.Link>
  );
}

function renderEvidence(items: EventCandidateItem['evidence']) {
  const first = items?.[0];
  if (!first) return '-';
  return (
    <Space direction="vertical" size={2}>
      <Typography.Text ellipsis={{ tooltip: first.quote }}>{first.quote}</Typography.Text>
      {renderUrl(first.sourceUrl)}
    </Space>
  );
}

function candidateStatusColor(status: EventCandidateItem['status']) {
  if (status === 'new') return 'blue';
  if (status === 'needs_review') return 'orange';
  if (status === 'accepted') return 'green';
  if (status === 'rejected') return 'red';
  return 'purple';
}

function formatDateTime(value?: string | null) {
  return value ? dayjs(value).format('MM-DD HH:mm') : '-';
}

function formatDateInput(value?: string | null) {
  if (!value) return '';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : value;
}

function splitList(value?: string | null) {
  return String(value || '')
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value: string[]) {
  return value.join(', ');
}

function normalizeOptionalString(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getEvidence(candidate: EventCandidateItem) {
  const extractedEvidence = candidate.extractedData.evidence;
  const evidence = Array.isArray(extractedEvidence) ? extractedEvidence : candidate.evidence;
  return evidence.filter(
    (item): item is EventCandidateItem['evidence'][number] =>
      Boolean(item) &&
      typeof item === 'object' &&
      'field' in item &&
      'sourceUrl' in item &&
      'quote' in item &&
      typeof item.field === 'string' &&
      typeof item.sourceUrl === 'string' &&
      typeof item.quote === 'string',
  );
}
