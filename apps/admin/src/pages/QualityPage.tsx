import { Button, Input, Modal, Segmented, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import type { Key } from 'react';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../api';
import type { FeedbackBulkResult, FeedbackItem, FeedbackSummary } from '../types';
import { feedbackStatusOptions } from '../constants';
import { showError } from '../utils/helpers';
import { useAdmin } from '../context/AdminContext';
import { boundedSelection, buildFeedbackQuery } from '../utils/feedback';

const eventFeedbackTypeOptions = [
  '日期有误',
  '报名状态有误',
  '官方链接失效',
  '赛事取消 / 延期',
  '信息重复',
  '其他',
].map((value) => ({ value, label: value }));

const productFeedbackTypeOptions = ['功能建议', '使用问题', '页面异常', '内容体验', '其他'].map(
  (value) => ({ value, label: value }),
);

const contextPageLabels: Record<string, string> = {
  home: '首页',
  events: '赛事列表',
  event_detail: '赛事详情',
  source_summary: '来源摘要',
  favorites: '我的收藏',
  choices: '我的选择',
  mine: '我的',
};

const riskLabels: Record<string, string> = {
  sql_probe: '疑似自动探测',
  jndi_probe: '疑似自动探测',
  script_probe: '疑似自动探测',
  path_probe: '疑似自动探测',
  control_character: '异常控制字符',
};

export function QualityPage() {
  const navigate = useNavigate();
  const { can } = useAdmin();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary>();
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [scope, setScope] = useState<'event_correction' | 'product_feedback'>('event_correction');
  const [status, setStatus] = useState<string>();
  const [feedbackType, setFeedbackType] = useState<string>();
  const [eventScope, setEventScope] = useState<string>();
  const [contextPage, setContextPage] = useState<string>();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const scopePending =
    scope === 'event_correction' ? summary?.eventCorrections : summary?.productFeedback;
  const scopeActionable = summary?.actionableByScope?.[scope] ?? 0;

  const load = async () => {
    try {
      setLoading(true);
      const query = buildFeedbackQuery({
        page,
        pageSize,
        status,
        scope,
        feedbackType,
        contextPage,
        eventScope,
        search,
      });
      const [list, nextSummary] = await Promise.all([
        apiGet<{ items: FeedbackItem[]; total: number }>(`/api/admin/feedback?${query}`),
        apiGet<FeedbackSummary>('/api/admin/feedback/summary'),
      ]);
      setItems(list.items);
      setTotal(list.total);
      setSummary(nextSummary);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => void load(), [page, pageSize, scope, status, feedbackType, eventScope, contextPage, search]);
  useEffect(() => setSelectedRowKeys([]), [page, pageSize, scope, status, feedbackType, eventScope, contextPage, search]);

  const changeFilter = (setter: (value: string | undefined) => void, value?: string) => {
    setter(value);
    setPage(1);
  };

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
        await load();
      },
    });
  };

  const openBulkPreview = () => {
    let nextStatus: 'resolved' | 'rejected' = 'rejected';
    let note = '';
    Modal.confirm({
      title: `批量处理 ${selectedRowKeys.length} 条反馈`,
      okText: '生成预览',
      content: (
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 12 }}>
          <Select
            defaultValue="rejected"
            style={{ width: '100%' }}
            options={[
              { value: 'rejected', label: '标记驳回' },
              { value: 'resolved', label: '标记已处理' },
            ]}
            onChange={(value) => {
              nextStatus = value as 'resolved' | 'rejected';
            }}
          />
          <Input.TextArea
            rows={4}
            placeholder="必填：处理备注"
            maxLength={1000}
            onChange={(event) => {
              note = event.target.value;
            }}
          />
        </Space>
      ),
      onOk: async () => {
        if (!note.trim()) {
          message.error('请填写处理备注');
          return Promise.reject();
        }
        const preview = await apiSend<FeedbackBulkResult>(
          'POST',
          '/api/admin/feedback/bulk-handle',
          {
            feedbackIds: selectedRowKeys.map(String),
            status: nextStatus,
            adminNote: note.trim(),
            dryRun: true,
          },
        );
        const ready = preview.items.filter((item) => item.ready);
        const unavailable = preview.items.length - ready.length;
        Modal.confirm({
          title: '确认应用批量处理？',
          okText: `处理 ${ready.length} 条`,
          okButtonProps: { danger: nextStatus === 'rejected', disabled: ready.length === 0 },
          content: (
            <Space direction="vertical" size={4} style={{ marginTop: 12 }}>
              <span>可处理：{ready.length} 条</span>
              <span>不可处理或已变化：{unavailable} 条</span>
              <span>状态：{nextStatus === 'rejected' ? '驳回' : '已处理'}</span>
              <span>备注：{note.trim()}</span>
            </Space>
          ),
          onOk: async () => {
            const result = await apiSend<FeedbackBulkResult>(
              'POST',
              '/api/admin/feedback/bulk-handle',
              {
                feedbackIds: selectedRowKeys.map(String),
                status: nextStatus,
                adminNote: note.trim(),
                dryRun: false,
                expected: preview.items.flatMap((item) =>
                  item.updatedAt ? [{ id: item.id, updatedAt: item.updatedAt }] : [],
                ),
              },
            );
            message.success(`已处理 ${result.handled.length} 条，失败 ${result.failed.length} 条`);
            setSelectedRowKeys(result.failed.map((item) => item.id));
            await load();
          },
        });
      },
    });
  };

  return (
    <main className="page">
      <div className="page-header quality-header">
        <div>
          <h1 className="page-title">反馈管理</h1>
          <div className="page-subtitle">分别处理赛事纠错与产品反馈，所有处理动作均保留审计记录</div>
        </div>
        {can('handle_feedback') && (
          <Button type="primary" disabled={!selectedRowKeys.length} onClick={openBulkPreview}>
            批量处理{selectedRowKeys.length ? `（${selectedRowKeys.length}）` : ''}
          </Button>
        )}
      </div>

      <div className="quality-stats">
        <Statistic title={scope === 'event_correction' ? '待处理赛事纠错' : '待处理产品反馈'} value={scopePending ?? 0} />
        <Statistic title="可人工处理" value={scopeActionable} />
        <Statistic title="异常探测" value={summary?.suspicious ?? 0} />
        <Statistic title="低信息" value={summary?.lowInformation ?? 0} />
        <Statistic
          title="近 7 天提交"
          value={summary?.submissions7d?.[scope] ?? 0}
        />
        <Statistic title="近 30 天提交" value={summary?.submissions30d?.[scope] ?? 0} />
      </div>

      <div className="quality-filters">
        <Segmented
          value={scope}
          options={[
            { value: 'event_correction', label: '赛事纠错' },
            { value: 'product_feedback', label: '产品反馈' },
          ]}
          onChange={(value) => {
            setScope(value as typeof scope);
            setFeedbackType(undefined);
            setEventScope(undefined);
            setContextPage(undefined);
            setPage(1);
          }}
        />
        <Input.Search
          allowClear
          value={searchInput}
          placeholder="搜索反馈内容或赛事"
          style={{ width: 260 }}
          onChange={(event) => setSearchInput(event.target.value)}
          onSearch={(value) => {
            setSearch(value.trim());
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="反馈状态"
          style={{ width: 150 }}
          options={feedbackStatusOptions}
          value={status}
          onChange={(value) => changeFilter(setStatus, value)}
        />
        <Select
          allowClear
          placeholder="反馈类型"
          style={{ width: 170 }}
          options={scope === 'event_correction' ? eventFeedbackTypeOptions : productFeedbackTypeOptions}
          value={feedbackType}
          onChange={(value) => changeFilter(setFeedbackType, value)}
        />
        {scope === 'event_correction' ? (
          <Select
            allowClear
            placeholder="赛事范围"
            style={{ width: 170 }}
            options={[
              { value: 'public', label: '当前公开赛事' },
              { value: 'unpublished', label: '当前非公开赛事' },
            ]}
            value={eventScope}
            onChange={(value) => changeFilter(setEventScope, value)}
          />
        ) : (
          <Select
            allowClear
            placeholder="反馈页面"
            style={{ width: 170 }}
            options={Object.entries(contextPageLabels).map(([value, label]) => ({ value, label }))}
            value={contextPage}
            onChange={(value) => changeFilter(setContextPage, value)}
          />
        )}
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        scroll={{ x: 1480 }}
        rowSelection={
          can('handle_feedback')
            ? {
                selectedRowKeys,
                getCheckboxProps: (record) => ({
                  disabled: !['pending', 'handling'].includes(record.status),
                }),
                onChange: (keys) => {
                  const selection = boundedSelection(keys);
                  if (!selection.accepted) {
                    message.warning('每次最多选择 50 条反馈');
                    return;
                  }
                  setSelectedRowKeys(selection.keys);
                },
              }
            : undefined
        }
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (value) => `共 ${value} 条`,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPageSize === pageSize ? nextPage : 1);
            setPageSize(nextPageSize);
          },
        }}
        columns={[
          {
            title: '反馈类型',
            dataIndex: 'feedbackType',
            width: 140,
            render: (value, record) => (record.invalidType ? '异常类型已隐藏' : value),
          },
          {
            title: '质量标记',
            width: 150,
            render: (_, record) => {
              if (record.invalidType) return <Tag color="red">非法反馈类型</Tag>;
              if (record.riskReason) return <Tag color="red">{riskLabels[record.riskReason]}</Tag>;
              if (record.lowInformation) return <Tag color="orange">缺少具体说明</Tag>;
              if (record.eventScope === 'unpublished') return <Tag>赛事当前不公开</Tag>;
              return <Tag color="green">可人工处理</Tag>;
            },
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (value) =>
              feedbackStatusOptions.find((item) => item.value === value)?.label || value,
          },
          {
            title: scope === 'event_correction' ? '关联赛事' : '反馈上下文',
            width: 240,
            render: (_, record) =>
              scope === 'event_correction' ? (
                record.event ? (
                  <Button type="link" onClick={() => navigate(`/events/edit/${record.event!.id}`)}>
                    {record.event.eventName}
                  </Button>
                ) : (
                  '-'
                )
              ) : (
                <Space direction="vertical" size={0}>
                  <span>{contextPageLabels[record.contextPage || ''] || '未标记页面'}</span>
                  <span>{record.appVersion ? `版本 ${record.appVersion}` : '版本未知'}</span>
                  {record.relatedRequestId && <Typography.Text copyable>{record.relatedRequestId}</Typography.Text>}
                </Space>
              ),
          },
          {
            title: '反馈内容',
            dataIndex: 'content',
            width: 320,
            ellipsis: true,
            render: (value, record) => (record.riskReason ? '异常内容已隐藏' : value),
          },
          { title: '处理备注', dataIndex: 'adminNote', width: 200, ellipsis: true },
          {
            title: '提交时间',
            dataIndex: 'createdAt',
            width: 150,
            render: (value) => dayjs(value).format('MM-DD HH:mm'),
          },
          {
            title: '操作',
            fixed: 'right',
            width: 170,
            render: (_, record) =>
              can('handle_feedback') && ['pending', 'handling'].includes(record.status) ? (
                <Space>
                  <Button size="small" onClick={() => handleFeedback(record, 'resolved')}>
                    已处理
                  </Button>
                  <Button size="small" danger onClick={() => handleFeedback(record, 'rejected')}>
                    驳回
                  </Button>
                </Space>
              ) : (
                '-'
              ),
          },
        ]}
      />
    </main>
  );
}
