import {
  Alert,
  Button,
  Descriptions,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import {
  CheckSquareOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  FileDoneOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  infoStatusLabels,
  publishStatusLabels,
  runJudgementLabels,
  signupStatusLabels,
} from '@worth-running/shared';
import { apiGet, apiSend } from '../api';
import { AdminEvent, BulkPublishResult } from '../types';
import {
  infoStatusOptions,
  publishStatusOptions,
  runJudgementOptions,
  signupStatusOptions,
} from '../constants';
import { showError } from '../utils/helpers';
import { buildMiniappPublishChecks } from '../utils/form';
import { EventLogsModal } from '../components/MiniappPublishChecks';
import { useAdmin } from '../context/AdminContext';

export function EventsPage() {
  const navigate = useNavigate();
  const { can } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [logEvent, setLogEvent] = useState<AdminEvent | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);

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
                <Space direction="vertical" size={8}>
                  <Descriptions size="small" column={1} bordered>
                    <Descriptions.Item label="官方入口">
                      {publishChecks.summary.officialUrl || '待补充'}
                    </Descriptions.Item>
                    <Descriptions.Item label="来源名称">
                      {publishChecks.summary.sourceName || '待补充'}
                    </Descriptions.Item>
                    <Descriptions.Item label="跑前判断">
                      {publishChecks.summary.runJudgement}
                    </Descriptions.Item>
                    <Descriptions.Item label="判断理由">
                      {publishChecks.summary.judgementReasons || '待补充'}
                    </Descriptions.Item>
                    <Descriptions.Item label="确认清单">
                      {publishChecks.summary.checklistCount
                        ? `${publishChecks.summary.checklistCount} 项`
                        : '待补充'}
                    </Descriptions.Item>
                    <Descriptions.Item label="风险词">
                      {publishChecks.summary.riskKeywords || '未命中'}
                    </Descriptions.Item>
                  </Descriptions>
                  <Space wrap>
                    {publishChecks.checks.map((item) => (
                      <Tag key={item.label} color={item.ok ? 'green' : 'orange'}>
                        {item.label}：{item.ok ? '已具备' : '待补充/需复核'}
                      </Tag>
                    ))}
                  </Space>
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

  const previewBulkPublish = async () => {
    if (!selectedEventIds.length) return;
    try {
      setPublishing(true);
      const preview = await apiSend<BulkPublishResult>('POST', '/api/admin/events/bulk-publish', {
        eventIds: selectedEventIds,
        dryRun: true,
      });
      const readyCount = preview.items.filter((item) => item.ready).length;
      Modal.confirm({
        title: `批量发布预览：${readyCount}/${preview.items.length} 条可发布`,
        width: 720,
        content: renderPublishPreview(preview.items),
        okText: '发布合格赛事',
        cancelText: '取消',
        okButtonProps: { disabled: readyCount === 0 },
        onOk: async () => {
          const result = await apiSend<BulkPublishResult>(
            'POST',
            '/api/admin/events/bulk-publish',
            {
              eventIds: selectedEventIds,
              dryRun: false,
              expected: preview.items
                .filter((item) => item.updatedAt)
                .map((item) => ({ id: item.id, updatedAt: item.updatedAt })),
            },
          );
          message.success(`已发布 ${result.published.length} 场，失败 ${result.failed.length} 场`);
          setSelectedEventIds([]);
          loadEvents();
        },
      });
    } catch (error) {
      showError(error);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">赛事库</h1>
          <div className="page-subtitle">维护赛事基础信息、发布状态与可信度</div>
        </div>
        <Space>
          {can('publish_event') && (
            <Button
              icon={<CheckSquareOutlined />}
              disabled={!selectedEventIds.length}
              loading={publishing}
              onClick={previewBulkPublish}
            >
              预览发布 ({selectedEventIds.length})
            </Button>
          )}
          {can('create_event') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/events/edit')}>
              新增赛事
            </Button>
          )}
        </Space>
      </div>
      <div className="toolbar events-toolbar">
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
        <Select
          placeholder="来源复核"
          allowClear
          options={[{ value: 'true', label: '有开放变更' }]}
          onChange={(value) => setFilters({ ...filters, sourceReviewPending: value })}
        />
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={events}
        rowSelection={
          can('publish_event')
            ? {
                selectedRowKeys: selectedEventIds,
                preserveSelectedRowKeys: true,
                onChange: (keys) => setSelectedEventIds(keys.map(String).slice(0, 20)),
                getCheckboxProps: (record: AdminEvent) => ({
                  disabled: record.publishStatus !== 'draft',
                }),
              }
            : undefined
        }
        scroll={{ x: 1580 }}
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
            title: '来源检查',
            dataIndex: 'sourceCheckedAt',
            width: 165,
            render: (value, record: AdminEvent) => (
              <Space direction="vertical" size={2}>
                <span>{value ? dayjs(value).format('MM-DD HH:mm') : '未检查'}</span>
                {record.sourceReviewPending && <Tag color="orange">有开放变更</Tag>}
              </Space>
            ),
          },
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
            render: (_, record) => {
              const archived = record.publishStatus === 'archived';
              return (
                <Space wrap>
                  {can('edit_event') && (
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => navigate(`/events/edit/${record.id}`)}
                    >
                      编辑
                    </Button>
                  )}
                  {can('publish_event') &&
                    (archived ? (
                      <Button
                        size="small"
                        icon={<FileDoneOutlined />}
                        onClick={() => changeStatus(record, 'publish', '恢复发布')}
                      >
                        恢复发布
                      </Button>
                    ) : (
                      <>
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
                        <Button
                          size="small"
                          onClick={() => changeStatus(record, 'archive', '归档赛事')}
                        >
                          归档
                        </Button>
                      </>
                    ))}
                  <Button size="small" onClick={() => setLogEvent(record)}>
                    日志
                  </Button>
                </Space>
              );
            },
          },
        ]}
      />
      <EventLogsModal event={logEvent} onClose={() => setLogEvent(null)} />
    </main>
  );
}

function renderPublishPreview(items: BulkPublishResult['items']) {
  return (
    <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
      {items.map((item) => (
        <Space key={item.id} wrap>
          <Tag color={item.ready ? 'green' : 'orange'}>{item.ready ? '可发布' : '待补充'}</Tag>
          <span>{item.eventName || item.id}</span>
          {!item.ready && <span>{item.issues.map(publishIssueLabel).join('、')}</span>}
        </Space>
      ))}
    </Space>
  );
}

function publishIssueLabel(issue: string) {
  const labels: Record<string, string> = {
    event_not_found: '赛事不存在',
    event_not_draft: '不在草稿状态',
    missing_event_name: '缺少赛事名称',
    missing_city: '缺少城市',
    missing_event_date: '缺少比赛日期',
    missing_distance_items: '缺少距离项目',
    missing_signup_status: '缺少报名状态',
    missing_official_url: '缺少官方确认入口',
    missing_source_name: '缺少来源名称',
    missing_source_url: '缺少来源链接',
    missing_source_level: '缺少来源等级',
    missing_run_judgement: '缺少跑前判断',
    missing_judgement_reasons: '缺少判断理由',
    missing_checklist: '缺少赛前清单',
    community_without_official_evidence: '社区来源缺少独立官网依据',
    user_flagged: '信息被用户标记',
    preview_snapshot_changed: '记录在预览后已更新',
    当前仅允许发布粤港澳大湾区赛事: '不在大湾区',
    比赛日期必须是北京时间明天及以后: '比赛日期不在未来',
  };
  return labels[issue] || issue.replace('risk_keyword:', '命中风险词：');
}
