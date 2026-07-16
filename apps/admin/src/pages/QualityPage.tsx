import { Button, Input, Modal, Select, Space, Statistic, Table, Tag, message } from 'antd';
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

const feedbackTypeOptions = [
  '日期有误',
  '报名状态有误',
  '官方链接失效',
  '赛事取消 / 延期',
  '信息重复',
  '其他',
].map((value) => ({ value, label: value }));

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
  const [status, setStatus] = useState<string>();
  const [feedbackType, setFeedbackType] = useState<string>();
  const [eventScope, setEventScope] = useState<string>();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);

  const load = async () => {
    try {
      setLoading(true);
      const query = buildFeedbackQuery({
        page,
        pageSize,
        status,
        feedbackType,
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

  useEffect(() => void load(), [page, pageSize, status, feedbackType, eventScope, search]);
  useEffect(() => setSelectedRowKeys([]), [page, pageSize, status, feedbackType, eventScope, search]);

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
          <h1 className="page-title">质量与反馈</h1>
          <div className="page-subtitle">筛出有效纠错，异常内容和治理动作均保留审计记录</div>
        </div>
        {can('handle_feedback') && (
          <Button type="primary" disabled={!selectedRowKeys.length} onClick={openBulkPreview}>
            批量处理{selectedRowKeys.length ? `（${selectedRowKeys.length}）` : ''}
          </Button>
        )}
      </div>

      <div className="quality-stats">
        <Statistic title="待处理" value={summary?.pending ?? 0} />
        <Statistic title="可人工处理" value={summary?.actionable ?? 0} />
        <Statistic title="异常探测" value={summary?.suspicious ?? 0} />
        <Statistic title="低信息" value={summary?.lowInformation ?? 0} />
        <Statistic title="非公开赛事" value={summary?.unpublishedEvent ?? 0} />
        <Statistic title="近 7 天拦截" value={summary?.blocked7d ?? 0} />
      </div>

      <div className="quality-filters">
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
          options={feedbackTypeOptions}
          value={feedbackType}
          onChange={(value) => changeFilter(setFeedbackType, value)}
        />
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
          { title: '反馈类型', dataIndex: 'feedbackType', width: 140 },
          {
            title: '质量标记',
            width: 150,
            render: (_, record) => {
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
