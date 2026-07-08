import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { EditOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../api';
import { runJudgementOptions, signupStatusOptions, sourceLevelOptions } from '../constants';
import { useAdmin } from '../context/AdminContext';
import { EventCandidateItem, EventSourceItem } from '../types';
import { showError } from '../utils/helpers';

const sourceTypeOptions = [
  { value: 'page_url', label: '页面 URL' },
  { value: 'search_query', label: '搜索关键词' },
  { value: 'rss', label: 'RSS' },
];

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
  const [sources, setSources] = useState<EventSourceItem[]>([]);
  const [candidates, setCandidates] = useState<EventCandidateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<EventCandidateItem | null>(null);
  const [savingSource, setSavingSource] = useState(false);
  const [savingCandidate, setSavingCandidate] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiGet<{ items: EventSourceItem[] }>('/api/admin/event-sources'),
      apiGet<{ items: EventCandidateItem[] }>('/api/admin/event-candidates'),
    ])
      .then(([sourceResult, candidateResult]) => {
        setSources(sourceResult.items);
        setCandidates(candidateResult.items);
      })
      .catch(showError)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createSource = async () => {
    try {
      const values = await sourceForm.validateFields();
      setSavingSource(true);
      await apiSend('POST', '/api/admin/event-sources', {
        name: values.name,
        sourceType: values.sourceType,
        entryUrl: normalizeOptionalString(values.entryUrl),
        searchQuery: normalizeOptionalString(values.searchQuery),
        allowedDomains: splitList(values.allowedDomains),
        cityHints: splitList(values.cityHints),
        status: 'active',
        notes: normalizeOptionalString(values.notes),
      });
      message.success('赛事源已创建');
      setSourceModalOpen(false);
      sourceForm.resetFields();
      load();
    } catch (error) {
      showError(error);
    } finally {
      setSavingSource(false);
    }
  };

  const runSource = async (source: EventSourceItem) => {
    try {
      await apiSend('POST', `/api/admin/event-sources/${source.id}/run`, {});
      message.success('已生成候选赛事，请在候选列表复核');
    } catch (error) {
      showError(error);
    } finally {
      load();
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
      load();
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
        else load();
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
          load();
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
          <div className="page-subtitle">
            AI 只生成候选草稿，发布前必须人工核验和补充。
          </div>
        </div>
        {can('manage_ai_sources') && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setSourceModalOpen(true)}
          >
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
            loading={loading}
            dataSource={sources}
            pagination={false}
            scroll={{ x: 980 }}
            columns={[
              { title: '名称', dataIndex: 'name', width: 180, fixed: 'left' },
              {
                title: '入口',
                width: 280,
                render: (_, record) => renderSourceEntry(record),
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
                title: '最近运行状态/时间',
                width: 230,
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
                title: '城市提示',
                dataIndex: 'cityHints',
                width: 180,
                render: (items: string[]) => (items.length ? items.join('、') : '-'),
              },
              {
                title: '操作',
                fixed: 'right',
                width: 130,
                render: (_, record) =>
                  can('manage_ai_sources') ? (
                    <Button
                      size="small"
                      icon={<RobotOutlined />}
                      onClick={() => runSource(record)}
                    >
                      手动抓取
                    </Button>
                  ) : (
                    '-'
                  ),
              },
            ]}
          />
        </section>

        <section className="form-section">
          <h2>候选赛事</h2>
          <Table<EventCandidateItem>
            rowKey="id"
            loading={loading}
            dataSource={candidates}
            scroll={{ x: 1320 }}
            columns={[
              { title: '赛事', dataIndex: 'eventName', width: 210, fixed: 'left' },
              { title: '城市', dataIndex: 'city', width: 100 },
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
        title="新增赛事源"
        open={sourceModalOpen}
        onOk={createSource}
        confirmLoading={savingSource}
        onCancel={() => {
          setSourceModalOpen(false);
          sourceForm.resetFields();
        }}
        destroyOnClose
      >
        <Form form={sourceForm} layout="vertical" initialValues={{ sourceType: 'page_url' }}>
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
          <Form.Item label="入口 URL" name="entryUrl">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item label="搜索关键词" name="searchQuery">
            <Input placeholder="例如：2026 广州 马拉松 报名" />
          </Form.Item>
          <Form.Item label="允许域名" name="allowedDomains" extra="多个域名用逗号或换行分隔">
            <Input.TextArea rows={2} placeholder="example.com, www.example.com" />
          </Form.Item>
          <Form.Item label="城市提示" name="cityHints" extra="多个城市用逗号或换行分隔">
            <Input placeholder="广州, 深圳, 佛山" />
          </Form.Item>
          <Form.Item label="备注" name="notes">
            <Input.TextArea rows={3} placeholder="只记录后台核验需要的备注" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑候选赛事"
        open={Boolean(editingCandidate)}
        width={760}
        onOk={saveCandidate}
        confirmLoading={savingCandidate}
        okText="保存候选"
        onCancel={() => {
          setEditingCandidate(null);
          candidateForm.resetFields();
        }}
        destroyOnClose
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

function renderSourceEntry(source: EventSourceItem) {
  if (source.entryUrl) return renderUrl(source.entryUrl);
  if (source.searchQuery) return <span>{source.searchQuery}</span>;
  return '-';
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
