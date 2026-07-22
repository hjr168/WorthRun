import {
  Alert,
  Avatar,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { ReloadOutlined, UserOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '../api';
import type { MiniappUserItem, MiniappUsersResponse } from '../types';
import { showError } from '../utils/helpers';

const { RangePicker } = DatePicker;

export function UsersPage() {
  const [data, setData] = useState<MiniappUsersResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState('');
  const [status, setStatus] = useState<string>();
  const [profile, setProfile] = useState<string>();
  const [hasReminder, setHasReminder] = useState<string>();
  const [dates, setDates] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [selected, setSelected] = useState<MiniappUserItem>();

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set('search', search);
    if (openId) params.set('openId', openId);
    if (status) params.set('status', status);
    if (profile) params.set('profile', profile);
    if (hasReminder) params.set('hasReminder', hasReminder);
    if (dates?.[0]) params.set('registeredFrom', dates[0].startOf('day').toISOString());
    if (dates?.[1]) params.set('registeredTo', dates[1].endOf('day').toISOString());
    return params.toString();
  }, [dates, hasReminder, openId, page, pageSize, profile, search, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await apiGet<MiniappUsersResponse>(`/api/admin/users?${queryString}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '用户列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => void load(), [load]);

  const refreshDetail = async (id: string) => {
    const detail = await apiGet<MiniappUserItem>(`/api/admin/users/${id}`);
    setSelected(detail);
    await load();
  };

  const changeStatus = (user: MiniappUserItem) => {
    const next = user.status === 'active' ? 'disabled' : 'active';
    Modal.confirm({
      title: next === 'disabled' ? '禁用该用户？' : '恢复该用户？',
      content:
        next === 'disabled'
          ? '禁用后用户仍可浏览赛事，但不能使用收藏、反馈和提醒。'
          : '恢复后用户可重新使用个性化功能。',
      okButtonProps: { danger: next === 'disabled' },
      onOk: async () => {
        await apiSend('PATCH', `/api/admin/users/${user.id}/status`, { status: next });
        message.success(next === 'disabled' ? '已禁用' : '已恢复');
        await refreshDetail(user.id);
      },
    });
  };

  const revealOpenId = async (user: MiniappUserItem) => {
    try {
      const result = await apiSend<{ openId: string }>(
        'POST',
        `/api/admin/users/${user.id}/reveal-openid`,
      );
      Modal.info({
        title: '完整 OpenID（本次查看已记录审计日志）',
        content: <Input.TextArea value={result.openId} readOnly autoSize />,
      });
    } catch (caught) {
      showError(caught);
    }
  };

  const clearProfile = (user: MiniappUserItem) => {
    Modal.confirm({
      title: '清除用户资料？',
      content: '将清除昵称和头像，不删除收藏、选择或反馈数据。',
      okButtonProps: { danger: true },
      onOk: async () => {
        await apiSend('DELETE', `/api/admin/users/${user.id}/profile`);
        message.success('用户资料已清除');
        await refreshDetail(user.id);
      },
    });
  };

  return (
    <main className="page users-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">用户管理</h1>
          <div className="page-subtitle">查看小程序用户和关联行为，敏感操作全部留痕</div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
          刷新
        </Button>
      </div>
      {error && <Alert type="error" showIcon message={error} />}
      <div className="users-filters">
        <Input.Search
          placeholder="昵称关键词"
          allowClear
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <Input.Search
          placeholder="完整 OpenID 精确查询"
          allowClear
          onSearch={(value) => {
            setOpenId(value);
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="全部状态"
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: 'active', label: '正常' },
            { value: 'disabled', label: '已禁用' },
          ]}
        />
        <Select
          allowClear
          placeholder="资料状态"
          onChange={(value) => {
            setProfile(value);
            setPage(1);
          }}
          options={[
            { value: 'complete', label: '已完善' },
            { value: 'incomplete', label: '未完善' },
          ]}
        />
        <Select
          allowClear
          placeholder="赛事提醒"
          onChange={(value) => {
            setHasReminder(value);
            setPage(1);
          }}
          options={[
            { value: 'true', label: '有有效提醒' },
            { value: 'false', label: '无有效提醒' },
          ]}
        />
        <RangePicker
          value={dates}
          onChange={(value) => {
            setDates(value);
            setPage(1);
          }}
        />
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.items ?? []}
        scroll={{ x: 1180 }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          onChange: (next, size) => {
            setPage(next);
            setPageSize(size);
          },
        }}
        columns={[
          {
            title: '用户',
            render: (_, item) => (
              <Space>
                <Avatar icon={<UserOutlined />} src={item.avatarUrl || undefined} />
                <div>
                  <div>{item.nickname || '跑者'}</div>
                  <small>{item.maskedOpenId}</small>
                </div>
              </Space>
            ),
          },
          {
            title: '注册时间',
            dataIndex: 'registeredAt',
            render: (value) => new Date(value).toLocaleString('zh-CN'),
          },
          {
            title: '最后活跃',
            dataIndex: 'lastActiveAt',
            render: (value) => new Date(value).toLocaleString('zh-CN'),
          },
          {
            title: '行为',
            render: (_, item) =>
              `收藏 ${item._count.favorites} · 选择 ${item._count.choices} · 反馈 ${item._count.feedback}`,
          },
          { title: '提醒', render: (_, item) => item._count.reminders },
          {
            title: '资料',
            render: (_, item) => (
              <Tag color={item.nickname || item.avatarFileId ? 'green' : 'default'}>
                {item.nickname || item.avatarFileId ? '已完善' : '未完善'}
              </Tag>
            ),
          },
          {
            title: '状态',
            render: (_, item) => (
              <Tag color={item.status === 'active' ? 'green' : 'red'}>
                {item.status === 'active' ? '正常' : '已禁用'}
              </Tag>
            ),
          },
          {
            title: '操作',
            render: (_, item) => (
              <Button
                type="link"
                onClick={async () => {
                  try {
                    await refreshDetail(item.id);
                  } catch (caught) {
                    showError(caught);
                  }
                }}
              >
                查看
              </Button>
            ),
          },
        ]}
      />
      <Drawer
        width={520}
        title="用户详情"
        open={Boolean(selected)}
        onClose={() => setSelected(undefined)}
      >
        {selected && (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Descriptions
              column={1}
              bordered
              size="small"
              items={[
                { key: 'nickname', label: '昵称', children: selected.nickname || '跑者' },
                { key: 'openid', label: 'OpenID', children: selected.maskedOpenId },
                {
                  key: 'registered',
                  label: '注册时间',
                  children: new Date(selected.registeredAt).toLocaleString('zh-CN'),
                },
                {
                  key: 'login',
                  label: '最后登录',
                  children: new Date(selected.lastLoginAt).toLocaleString('zh-CN'),
                },
                {
                  key: 'active',
                  label: '最后活跃',
                  children: new Date(selected.lastActiveAt).toLocaleString('zh-CN'),
                },
                {
                  key: 'summary',
                  label: '行为摘要',
                  children: `收藏 ${selected._count.favorites}，选择 ${selected._count.choices}，反馈 ${selected._count.feedback}，分享 ${selected._count.shares ?? 0}`,
                },
              ]}
            />
            <Space wrap>
              <Button onClick={() => void revealOpenId(selected)}>查看完整 OpenID</Button>
              <Button danger={selected.status === 'active'} onClick={() => changeStatus(selected)}>
                {selected.status === 'active' ? '禁用用户' : '恢复用户'}
              </Button>
              <Button
                danger
                disabled={!selected.nickname && !selected.avatarFileId}
                onClick={() => clearProfile(selected)}
              >
                清除资料
              </Button>
            </Space>
          </Space>
        )}
      </Drawer>
    </main>
  );
}
