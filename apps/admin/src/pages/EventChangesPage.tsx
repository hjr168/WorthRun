import {
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Input,
  List,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../api';
import { useAdmin } from '../context/AdminContext';
import type {
  EventChangeAlertItem,
  EventChangeAlertQuery,
  EventChangeAlertSummary,
  EventChangeField,
  EventChangeResolutionPreview,
} from '../types';
import {
  buildEventChangeQuery,
  eventChangeFieldLabel,
  eventChangeSeverityLabel,
  eventChangeStatusLabel,
} from '../utils/eventChanges';
import { showError } from '../utils/helpers';

const { Text, Paragraph } = Typography;
const applicableFields: EventChangeField[] = [
  'eventDate',
  'distanceItems',
  'signupStatus',
  'signupDeadline',
  'officialUrl',
];

const emptySummary: EventChangeAlertSummary = {
  open: 0,
  critical: 0,
  important: 0,
  stalePublishedEvents: 0,
  checkedWithin7Days: 0,
  appliedWithin30Days: 0,
};

export function EventChangesPage() {
  const { can } = useAdmin();
  const [items, setItems] = useState<EventChangeAlertItem[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState<EventChangeAlertQuery>({
    page: 1,
    pageSize: 20,
    status: 'open',
  });
  const [selected, setSelected] = useState<EventChangeAlertItem | null>(null);
  const [selectedFields, setSelectedFields] = useState<EventChangeField[]>([]);
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([
        apiGet<{ items: EventChangeAlertItem[]; total: number }>(
          `/api/admin/event-change-alerts?${buildEventChangeQuery(query)}`,
        ),
        apiGet<EventChangeAlertSummary>('/api/admin/event-change-alerts/summary'),
      ]);
      setItems(list.items);
      setTotal(list.total);
      setSummary(stats);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [query]);

  const openAlert = (item: EventChangeAlertItem) => {
    setSelected(item);
    setSelectedFields(
      item.changedFields.filter((field) => applicableFields.includes(field)),
    );
    setNote('');
  };

  const resolve = async (action: 'apply_fields' | 'dismiss' | 'archive_event') => {
    if (!selected) return;
    if (note.trim().length < 4) {
      message.warning('请填写至少 4 个字的处理备注');
      return;
    }
    if (action === 'apply_fields' && !selectedFields.length) {
      message.warning('请至少选择一个要应用的字段');
      return;
    }
    try {
      setResolving(true);
      const payload = {
        dryRun: true,
        action,
        fields: action === 'apply_fields' ? selectedFields : undefined,
        note: note.trim(),
      };
      const dryRun = await apiSend<{ dryRun: true; preview: EventChangeResolutionPreview }>(
        'POST',
        `/api/admin/event-change-alerts/${selected.id}/resolve`,
        payload,
      );
      if (!dryRun.preview.ready) {
        message.error(`预览未通过：${dryRun.preview.issues.join('、')}`);
        return;
      }
      Modal.confirm({
        title: actionTitle(action),
        okText: action === 'archive_event' ? '确认归档赛事' : '确认处理',
        okButtonProps: { danger: action === 'archive_event' },
        content: (
          <div className="event-change-confirm">
            <Paragraph>{selected.event.eventName}</Paragraph>
            {Object.entries(dryRun.preview.changes).map(([field, values]) => (
              <div key={field}>
                <Text strong>{eventChangeFieldLabel(field as EventChangeField)}：</Text>
                {formatValue(values.before)} → {formatValue(values.after)}
              </div>
            ))}
            <Paragraph type="secondary">备注：{note.trim()}</Paragraph>
          </div>
        ),
        onOk: async () => {
          await apiSend(
            'POST',
            `/api/admin/event-change-alerts/${selected.id}/resolve`,
            { ...payload, dryRun: false, expected: dryRun.preview.expected },
          );
          message.success('变更告警已处理');
          setSelected(null);
          await load();
        },
      });
    } catch (error) {
      showError(error);
    } finally {
      setResolving(false);
    }
  };

  return (
    <main className="page event-changes-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">赛事变更复核</h1>
          <div className="page-subtitle">官方与可信来源的变化只进入人工复核，不会自动发布。</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      </div>

      <div className="event-change-stat-strip">
        <Statistic title="待复核" value={summary.open} />
        <Statistic title="严重" value={summary.critical} />
        <Statistic title="重要" value={summary.important} />
        <Statistic title="超过 14 天未检查" value={summary.stalePublishedEvents} />
        <Statistic title="7 天内已检查" value={summary.checkedWithin7Days} />
        <Statistic title="30 天内已应用" value={summary.appliedWithin30Days} />
      </div>

      <div className="event-change-filters">
        <Input.Search
          allowClear
          placeholder="搜索赛事或来源"
          defaultValue={query.search}
          onSearch={(search) => setQuery((value) => ({ ...value, search, page: 1 }))}
        />
        <Select
          value={query.status || ''}
          onChange={(status) =>
            setQuery((value) => ({
              ...value,
              status: status as EventChangeAlertQuery['status'],
              page: 1,
            }))
          }
          options={[
            { value: '', label: '全部状态' },
            { value: 'open', label: '待复核' },
            { value: 'applied', label: '已应用' },
            { value: 'dismissed', label: '已忽略' },
            { value: 'archived_event', label: '赛事已归档' },
            { value: 'superseded', label: '已取代' },
          ]}
        />
        <Select
          value={query.severity || ''}
          onChange={(severity) =>
            setQuery((value) => ({
              ...value,
              severity: severity as EventChangeAlertQuery['severity'],
              page: 1,
            }))
          }
          options={[
            { value: '', label: '全部严重度' },
            { value: 'critical', label: '严重' },
            { value: 'important', label: '重要' },
            { value: 'normal', label: '一般' },
          ]}
        />
        <Select
          value={query.changedField || ''}
          onChange={(changedField) =>
            setQuery((value) => ({
              ...value,
              changedField: changedField as EventChangeAlertQuery['changedField'],
              page: 1,
            }))
          }
          options={[
            { value: '', label: '全部字段' },
            ...([...applicableFields, 'cancellationSignal', 'postponementSignal'] as EventChangeField[]).map(
              (field) => ({ value: field, label: eventChangeFieldLabel(field) }),
            ),
          ]}
        />
      </div>

      <Table<EventChangeAlertItem>
        rowKey="id"
        loading={loading}
        dataSource={items}
        scroll={{ x: 1180 }}
        pagination={{
          current: query.page,
          pageSize: query.pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          onChange: (page, pageSize) => setQuery((value) => ({ ...value, page, pageSize })),
        }}
        columns={[
          {
            title: '赛事',
            dataIndex: ['event', 'eventName'],
            width: 250,
            ellipsis: true,
          },
          {
            title: '严重度',
            dataIndex: 'severity',
            width: 90,
            render: (severity) => (
              <Tag color={severity === 'critical' ? 'red' : severity === 'important' ? 'orange' : 'blue'}>
                {eventChangeSeverityLabel(severity)}
              </Tag>
            ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (status) => eventChangeStatusLabel(status),
          },
          {
            title: '变化字段',
            dataIndex: 'changedFields',
            width: 280,
            render: (fields: EventChangeField[]) => (
              <Space size={[4, 4]} wrap>
                {fields.map((field) => <Tag key={field}>{eventChangeFieldLabel(field)}</Tag>)}
              </Space>
            ),
          },
          { title: '来源', dataIndex: ['source', 'name'], width: 180, ellipsis: true },
          {
            title: '发现时间',
            dataIndex: 'createdAt',
            width: 140,
            render: (value) => dayjs(value).format('MM-DD HH:mm'),
          },
          {
            title: '操作',
            fixed: 'right',
            width: 100,
            render: (_, item) => <Button type="link" onClick={() => openAlert(item)}>查看复核</Button>,
          },
        ]}
      />

      <Drawer
        width="min(680px, 100vw)"
        open={Boolean(selected)}
        title={selected ? `变更复核 · ${selected.event.eventName}` : '变更复核'}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="状态">{eventChangeStatusLabel(selected.status)}</Descriptions.Item>
              <Descriptions.Item label="来源">{selected.source.name}</Descriptions.Item>
              <Descriptions.Item label="来源链接">
                {selected.sourceUrl ? (
                  <a className="event-change-url" href={selected.sourceUrl} target="_blank" rel="noreferrer">
                    {selected.sourceUrl}
                  </a>
                ) : '-'}
              </Descriptions.Item>
              {selected.changedFields.map((field) => (
                <Descriptions.Item key={field} label={eventChangeFieldLabel(field)}>
                  <div className="event-change-diff">
                    <span><Text type="secondary">当前：</Text>{formatValue(selected.beforeValue[field])}</span>
                    <span><Text type="secondary">来源：</Text>{formatValue(selected.afterValue[field])}</span>
                  </div>
                </Descriptions.Item>
              ))}
            </Descriptions>

            <h3>来源证据</h3>
            <List
              size="small"
              locale={{ emptyText: '暂无证据摘录' }}
              dataSource={selected.evidence.slice(0, 10)}
              renderItem={(evidence) => (
                <List.Item>
                  <div>
                    <Text strong>{evidence.field || '来源摘录'}</Text>
                    <div>{evidence.quote || '-'}</div>
                  </div>
                </List.Item>
              )}
            />

            {selected.status === 'open' && can('review_event_changes') && (
              <div className="event-change-actions">
                {can('apply_event_changes') && (
                  <Checkbox.Group
                    value={selectedFields}
                    onChange={(fields) => setSelectedFields(fields as EventChangeField[])}
                    options={selected.changedFields
                      .filter((field) => applicableFields.includes(field))
                      .map((field) => ({ value: field, label: eventChangeFieldLabel(field) }))}
                  />
                )}
                <Input.TextArea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  maxLength={500}
                  showCount
                  placeholder="填写处理依据（4-500 字）"
                />
                <Space wrap>
                  {can('apply_event_changes') && (
                    <Button type="primary" loading={resolving} onClick={() => void resolve('apply_fields')}>
                      预览并应用所选字段
                    </Button>
                  )}
                  <Button loading={resolving} onClick={() => void resolve('dismiss')}>忽略告警</Button>
                  {can('apply_event_changes') &&
                    selected.severity === 'critical' &&
                    selected.changedFields.includes('cancellationSignal') && (
                      <Button danger loading={resolving} onClick={() => void resolve('archive_event')}>
                        预览并归档赛事
                      </Button>
                    )}
                </Space>
              </div>
            )}
          </>
        )}
      </Drawer>
    </main>
  );
}

function actionTitle(action: 'apply_fields' | 'dismiss' | 'archive_event') {
  if (action === 'apply_fields') return '确认应用来源变更？';
  if (action === 'archive_event') return '确认归档该赛事？';
  return '确认忽略该告警？';
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return value.join('、');
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}
