import { Button, Input, Select, Space, Table } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import type { TablePaginationConfig } from 'antd';
import { apiGet } from '../api';
import { OperationLog } from '../types';
import { showError } from '../utils/helpers';

const actionOptions = [
  { value: 'event.create', label: 'event.create' },
  { value: 'event.update', label: 'event.update' },
  { value: 'event.publish', label: 'event.publish' },
  { value: 'event.hide', label: 'event.hide' },
  { value: 'event.offline', label: 'event.offline' },
  { value: 'event.archive', label: 'event.archive' },
  { value: 'feedback.handle', label: 'feedback.handle' },
  { value: 'config.update', label: 'config.update' },
  { value: 'admin_user.create', label: 'admin_user.create' },
  { value: 'admin_user.update', label: 'admin_user.update' },
];

const targetTypeOptions = [
  { value: 'events', label: 'events' },
  { value: 'feedback', label: 'feedback' },
  { value: 'config', label: 'config' },
  { value: 'admin_users', label: 'admin_users' },
];

export function LogsPage() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OperationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [action, setAction] = useState<string>();
  const [targetType, setTargetType] = useState<string>();
  const [targetId, setTargetId] = useState<string>('');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (action) params.set('action', action);
    if (targetType) params.set('targetType', targetType);
    if (targetId.trim()) params.set('targetId', targetId.trim());
    apiGet<{ items: OperationLog[]; total: number; page: number; pageSize: number }>(
      `/api/admin/operation-logs?${params.toString()}`,
    )
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch(showError)
      .finally(() => setLoading(false));
  }, [page, pageSize, action, targetType, targetId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 20);
  };

  const resetFilters = () => {
    setAction(undefined);
    setTargetType(undefined);
    setTargetId('');
    setPage(1);
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">操作日志</h1>
          <div className="page-subtitle">查询后台关键操作记录，支持按动作、对象筛选</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
      </div>
      <div className="toolbar">
        <Select
          allowClear
          placeholder="动作类型"
          style={{ width: 200 }}
          options={actionOptions}
          value={action}
          onChange={(value) => {
            setAction(value);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="目标类型"
          style={{ width: 160 }}
          options={targetTypeOptions}
          value={targetType}
          onChange={(value) => {
            setTargetType(value);
            setPage(1);
          }}
        />
        <Input
          allowClear
          placeholder="目标 ID（精确匹配）"
          style={{ width: 220 }}
          value={targetId}
          onChange={(event) => {
            setTargetId(event.target.value);
            setPage(1);
          }}
        />
        <Button onClick={resetFilters}>重置筛选</Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        scroll={{ x: 980 }}
        locale={{ emptyText: '暂无操作日志记录' }}
        onChange={handleTableChange}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
        }}
        columns={[
          {
            title: '时间',
            dataIndex: 'createdAt',
            width: 160,
            render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '操作人',
            dataIndex: 'adminUserId',
            width: 140,
            render: (value?: string) => value || '-',
          },
          { title: '动作', dataIndex: 'action', width: 170 },
          { title: '目标类型', dataIndex: 'targetType', width: 130 },
          {
            title: '目标 ID',
            dataIndex: 'targetId',
            width: 160,
            render: (value: string | undefined) => value || '-',
          },
          {
            title: '说明',
            dataIndex: 'note',
            render: (value: string | undefined) => value || '-',
          },
        ]}
      />
    </main>
  );
}
