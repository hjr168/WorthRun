import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from 'antd';
import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiSend } from '../api';
import { useAdmin } from '../context/AdminContext';
import type { EventVerificationItem, EventVerificationSummary } from '../types';

const issueLabels: Record<string, string> = {
  event_not_published: '赛事未发布',
  source_not_trusted: '来源等级不足',
  missing_official_url: '缺少官方入口',
  missing_source_name: '缺少来源名称',
  missing_source_url: '缺少来源链接',
  missing_distance_items: '缺少距离',
  missing_published_source_summary: '缺少已发布摘要',
  source_summary_stale: '来源摘要待复核',
  open_change_alert: '存在变更告警',
  preview_snapshot_changed: '预览后数据已变化',
  duplicate_published_event: '疑似重复已发布赛事',
};

const reminderIssueLabels: Record<string, string> = {
  event_not_reminder_ready: '赛事基础条件未满足',
  missing_signup_start_at: '缺少报名开始时间',
  missing_signup_deadline: '缺少报名截止时间',
  signup_not_active: '报名当前不可提醒',
  missing_event_start_at: '缺少真实开赛时间',
  race_less_than_24h: '距离比赛不足 24 小时',
};

type PreviewItem = {
  id: string;
  eventName: string;
  ready: boolean;
  issues: string[];
  updatedAt: string | null;
};

export function EventVerificationPage() {
  const { admin, can } = useAdmin();
  const [summary, setSummary] = useState<EventVerificationSummary>();
  const [items, setItems] = useState<EventVerificationItem[]>([]);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [issue, setIssue] = useState('');
  const [city, setCity] = useState('');
  const [reminderEligible, setReminderEligible] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '100' });
      if (issue) params.set('issue', issue);
      if (city) params.set('city', city);
      if (reminderEligible) params.set('reminderEligible', reminderEligible);
      const [summaryResult, listResult] = await Promise.all([
        apiGet<EventVerificationSummary>('/api/admin/event-verification/summary'),
        apiGet<{ items: EventVerificationItem[] }>(
          `/api/admin/event-verification?${params.toString()}`,
        ),
      ]);
      setSummary(summaryResult);
      setItems(listResult.items);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '赛事核验数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [city, issue, reminderEligible]);

  useEffect(() => void load(), [load]);

  const previewVerify = async () => {
    if (note.trim().length < 4) {
      message.warning('请先填写至少 4 个字的核验备注');
      return;
    }
    const result = await apiSend<{ items: PreviewItem[] }>(
      'POST',
      '/api/admin/events/bulk-verify',
      { eventIds: selected, dryRun: true, note: note.trim() },
    );
    setPreview(result.items);
  };

  const applyVerify = async () => {
    setApplying(true);
    try {
      const result = await apiSend<{
        verified: Array<{ id: string }>;
        failed: Array<{ id: string; issues: string[] }>;
      }>('POST', '/api/admin/events/bulk-verify', {
        eventIds: selected,
        dryRun: false,
        note: note.trim(),
        expected: preview
          .filter((item) => item.updatedAt)
          .map((item) => ({ id: item.id, updatedAt: item.updatedAt })),
      });
      message.success(`已核验 ${result.verified.length} 场，失败 ${result.failed.length} 场`);
      setSelected([]);
      setPreview([]);
      setNote('');
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '应用核验失败');
    } finally {
      setApplying(false);
    }
  };

  const archiveDuplicate = async (item: EventVerificationItem) => {
    const primaryId = item.suggestedPrimaryId;
    if (!primaryId || primaryId === item.id) return;
    try {
      const preview = await apiSend<{
        primary: { id: string; eventName: string; updatedAt: string };
        duplicate: { id: string; eventName: string; updatedAt: string };
        related: {
          favorites: number;
          choices: number;
          reminders: number;
          feedback: number;
          shares: number;
          interactions: number;
          sourceSummaries: number;
        };
      }>('POST', '/api/admin/data-quality/cleanup', {
        action: 'archive_duplicate_published_event',
        primaryId,
        duplicateId: item.id,
        dryRun: true,
      });
      Modal.confirm({
        title: '确认归档重复赛事',
        content: (
          <Space direction="vertical" size={8}>
            <div>保留：{preview.primary.eventName}</div>
            <div>归档：{preview.duplicate.eventName}</div>
            <div>
              用户关联：收藏 {preview.related.favorites}、选择 {preview.related.choices}、提醒{' '}
              {preview.related.reminders}、反馈 {preview.related.feedback}、分享{' '}
              {preview.related.shares}
            </div>
            <div>存在用户关联数据时系统会拒绝归档。</div>
          </Space>
        ),
        okText: '确认归档',
        okButtonProps: {
          danger: true,
          disabled:
            preview.related.favorites +
              preview.related.choices +
              preview.related.reminders +
              preview.related.feedback +
              preview.related.shares >
            0,
        },
        onOk: async () => {
          await apiSend('POST', '/api/admin/data-quality/cleanup', {
            action: 'archive_duplicate_published_event',
            primaryId,
            duplicateId: item.id,
            dryRun: false,
            expected: {
              primaryUpdatedAt: preview.primary.updatedAt,
              duplicateUpdatedAt: preview.duplicate.updatedAt,
              related: preview.related,
            },
          });
          message.success('重复赛事已归档并写入操作日志');
          await load();
        },
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重复赛事预览失败');
    }
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">赛事核验</h1>
          <div className="page-subtitle">人工确认来源证据后，赛事才可以进入提醒资格判断</div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
          刷新
        </Button>
      </div>

      <div className="stat-grid">
        <Card>
          <Statistic title="待人工核验" value={summary?.pending ?? 0} />
        </Card>
        <Card>
          <Statistic title="当前可核验" value={summary?.ready ?? 0} />
        </Card>
        <Card>
          <Statistic title="缺少来源摘要" value={summary?.missingSummary ?? 0} />
        </Card>
        <Card>
          <Statistic title="摘要待复核" value={summary?.staleSummary ?? 0} />
        </Card>
        <Card>
          <Statistic title="开放变更告警" value={summary?.openAlerts ?? 0} />
        </Card>
        <Card>
          <Statistic title="可订阅赛事" value={summary?.reminderEligible ?? 0} />
        </Card>
        <Card>
          <Statistic title="疑似重复组" value={summary?.duplicatePublishedGroups ?? 0} />
        </Card>
      </div>

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="核验问题"
            style={{ width: 190 }}
            value={issue || undefined}
            onChange={(value) => setIssue(value || '')}
            options={Object.entries(issueLabels).map(([value, label]) => ({ value, label }))}
          />
          <Input
            allowClear
            placeholder="城市"
            style={{ width: 140 }}
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
          <Select
            allowClear
            placeholder="提醒资格"
            style={{ width: 150 }}
            value={reminderEligible || undefined}
            onChange={(value) => setReminderEligible(value || '')}
            options={[
              { value: 'true', label: '可订阅提醒' },
              { value: 'false', label: '暂不可订阅' },
            ]}
          />
        </Space>
        <Table<EventVerificationItem>
          rowKey="id"
          loading={loading}
          dataSource={items}
          pagination={false}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            getCheckboxProps: (record) => ({
              disabled: selected.length >= 20 && !selected.includes(record.id),
            }),
          }}
          scroll={{ x: 1100 }}
          columns={[
            {
              title: '赛事',
              dataIndex: 'eventName',
              render: (value, item) => <Link to={`/events/edit/${item.id}`}>{value}</Link>,
            },
            { title: '城市', dataIndex: 'city', width: 90 },
            { title: '比赛日期', dataIndex: 'eventDate', width: 120 },
            {
              title: '信息状态',
              dataIndex: 'infoStatus',
              width: 110,
              render: (value) => (
                <Tag color={value === 'verified' ? 'green' : 'orange'}>
                  {value === 'verified' ? '已核实' : '待核实'}
                </Tag>
              ),
            },
            {
              title: '提醒资格',
              width: 300,
              render: (_, item) => (
                <Space size={[4, 4]} wrap>
                  {item.availableReminderTypes.map((type) => (
                    <Tag key={type} color="green">
                      {type === 'signup' ? '报名提醒' : '赛前提醒'}
                    </Tag>
                  ))}
                  {!item.availableReminderTypes.length &&
                    item.reminderIssues.map((value) => (
                      <Tag key={value} color="orange">
                        {reminderIssueLabels[value] || value}
                      </Tag>
                    ))}
                </Space>
              ),
            },
            {
              title: '核验结果',
              width: 330,
              render: (_, item) =>
                item.ready ? (
                  <Tag color="green">可以核验</Tag>
                ) : (
                  <Space size={[4, 4]} wrap>
                    {item.issues.map((value) => (
                      <Tag key={value} color="orange">
                        {issueLabels[value] || value}
                      </Tag>
                    ))}
                  </Space>
                ),
            },
            {
              title: '操作',
              width: 130,
              fixed: 'right',
              render: (_, item) =>
                admin?.role === 'super_admin' &&
                item.suggestedPrimaryId &&
                item.suggestedPrimaryId !== item.id ? (
                  <Button danger size="small" onClick={() => void archiveDuplicate(item)}>
                    归档重复项
                  </Button>
                ) : (
                  <Link to={`/events/edit/${item.id}`}>查看赛事</Link>
                ),
            },
          ]}
        />
      </Card>

      {can('edit_event') && (
        <Card title="批量核验" style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type="info" showIcon message={`已选择 ${selected.length} 场，单次最多 20 场`} />
            <Input.TextArea
              rows={3}
              maxLength={500}
              showCount
              placeholder="填写人工核验依据和备注"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <Space>
              <Button
                icon={<CheckCircleOutlined />}
                disabled={!selected.length}
                onClick={() => void previewVerify()}
              >
                预览核验
              </Button>
              <Button
                type="primary"
                disabled={!preview.length || preview.some((item) => !item.ready)}
                loading={applying}
                onClick={() => void applyVerify()}
              >
                确认应用
              </Button>
            </Space>
            {preview.length > 0 && (
              <Space wrap>
                {preview.map((item) => (
                  <Tag key={item.id} color={item.ready ? 'green' : 'red'}>
                    {item.eventName}：
                    {item.ready
                      ? '可核验'
                      : item.issues.map((value) => issueLabels[value] || value).join('、')}
                  </Tag>
                ))}
              </Space>
            )}
          </Space>
        </Card>
      )}
    </main>
  );
}
