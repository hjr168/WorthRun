import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiSend } from '../api';
import { AdminUserListItem, SystemConfigItem } from '../types';
import { showError } from '../utils/helpers';
import { useAdmin } from '../context/AdminContext';

const roleLabels: Record<string, string> = {
  super_admin: '超级管理员',
  event_operator: '赛事运营',
  content_reviewer: '内容复查',
  readonly: '只读查看',
};

const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ value, label }));

function ComplianceTab() {
  const { can } = useAdmin();
  const [configs, setConfigs] = useState<SystemConfigItem[]>([]);
  const [notice, setNotice] = useState('');
  const [actionText, setActionText] = useState('');
  const [savingKey, setSavingKey] = useState<string>();
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiGet<{ items: SystemConfigItem[] }>('/api/admin/system-configs')
      .then((result) => {
        setConfigs(result.items);
        const noticeItem = result.items.find((item) => item.configKey === 'compliance_notice');
        const actionItem = result.items.find((item) => item.configKey === 'official_action_text');
        setNotice((noticeItem?.configValue as string) || '');
        setActionText((actionItem?.configValue as string) || '');
      })
      .catch(showError)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = (key: 'compliance_notice' | 'official_action_text', value: string) => {
    setSavingKey(key);
    apiSend('PUT', `/api/admin/system-configs/${key}`, { configValue: value })
      .then(() => {
        message.success('保存成功');
        load();
      })
      .catch(showError)
      .finally(() => setSavingKey(undefined));
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>合规文案（compliance_notice）</div>
        <Input.TextArea
          rows={3}
          value={notice}
          onChange={(event) => setNotice(event.target.value)}
          placeholder="例如：AI 整理，仅供参考，报名以官方为准。"
          disabled={!can('manage_settings')}
        />
        {can('manage_settings') && (
          <Button
            type="primary"
            style={{ marginTop: 8 }}
            loading={savingKey === 'compliance_notice'}
            onClick={() => save('compliance_notice', notice)}
          >
            保存
          </Button>
        )}
      </div>
      <div>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>官方入口文案（official_action_text）</div>
        <Input
          value={actionText}
          onChange={(event) => setActionText(event.target.value)}
          placeholder="例如：前往官方确认"
          disabled={!can('manage_settings')}
        />
        {can('manage_settings') && (
          <Button
            type="primary"
            style={{ marginTop: 8 }}
            loading={savingKey === 'official_action_text'}
            onClick={() => save('official_action_text', actionText)}
          >
            保存
          </Button>
        )}
      </div>
      {loading && <div style={{ marginTop: 16, color: '#999' }}>加载中…</div>}
      {!loading && configs.length === 0 && (
        <div style={{ marginTop: 16, color: '#999' }}>暂无配置，保存后将自动创建。</div>
      )}
    </div>
  );
}

interface EditFormValues {
  displayName: string;
  role: string;
  password?: string;
}

interface CreateFormValues {
  username: string;
  password: string;
  displayName: string;
  role: string;
}

function AdminTab() {
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserListItem | null>(null);
  const [createForm] = Form.useForm<CreateFormValues>();
  const [editForm] = Form.useForm<EditFormValues>();

  const load = () => {
    setLoading(true);
    setForbidden(false);
    apiGet<{ items: AdminUserListItem[] }>('/api/admin/admin-users')
      .then((result) => setItems(result.items))
      .catch((error: unknown) => {
        if (error instanceof Error && /无权|权限/.test(error.message)) {
          setForbidden(true);
        } else {
          showError(error);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submitCreate = async () => {
    const values = await createForm.validateFields();
    await apiSend('POST', '/api/admin/admin-users', values);
    message.success('管理员已新增');
    setCreateOpen(false);
    createForm.resetFields();
    load();
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    const values = await editForm.validateFields();
    const payload: Record<string, string> = {};
    if (values.displayName) payload.displayName = values.displayName;
    if (values.role) payload.role = values.role;
    if (values.password) payload.password = values.password;
    await apiSend('PATCH', `/api/admin/admin-users/${editTarget.id}`, payload);
    message.success('管理员已更新');
    setEditTarget(null);
    editForm.resetFields();
    load();
  };

  const toggleStatus = (record: AdminUserListItem) => {
    const next = record.status === 'active' ? 'disabled' : 'active';
    apiSend('PATCH', `/api/admin/admin-users/${record.id}`, { status: next })
      .then(() => {
        message.success(next === 'active' ? '已启用' : '已禁用');
        load();
      })
      .catch(showError);
  };

  if (forbidden) {
    return (
      <Alert
        type="warning"
        showIcon
        message="无权限"
        description="仅超级管理员可管理后台账号，当前角色无权访问。"
      />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          新增管理员
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={[
          { title: '用户名', dataIndex: 'username', width: 160 },
          { title: '显示名', dataIndex: 'displayName', width: 160 },
          {
            title: '角色',
            dataIndex: 'role',
            width: 130,
            render: (value: string) => roleLabels[value] || value,
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (value: 'active' | 'disabled') =>
              value === 'active' ? <Tag color="green">启用</Tag> : <Tag color="default">禁用</Tag>,
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 160,
            render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '操作',
            width: 180,
            render: (_, record) => (
              <Space>
                <Button
                  size="small"
                  onClick={() => {
                    setEditTarget(record);
                    editForm.setFieldsValue({
                      displayName: record.displayName,
                      role: record.role,
                      password: '',
                    });
                  }}
                >
                  编辑
                </Button>
                {record.status === 'active' ? (
                  <Popconfirm title="确认禁用该管理员？" onConfirm={() => toggleStatus(record)}>
                    <Button size="small" danger>
                      禁用
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button size="small" onClick={() => toggleStatus(record)}>
                    启用
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="新增管理员"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={submitCreate}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" initialValues={{ role: 'readonly' }}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { max: 50, message: '用户名不超过 50 字符' },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="displayName"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`编辑管理员：${editTarget?.username ?? ''}`}
        open={!!editTarget}
        onCancel={() => {
          setEditTarget(null);
          editForm.resetFields();
        }}
        onOk={submitEdit}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="displayName"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item
            name="password"
            label="重置密码"
            extra="留空则不修改密码"
            rules={[{ min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password autoComplete="new-password" placeholder="留空则不修改" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function AboutTab() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>哪场值得跑 V0.1 后台</h2>
      <p style={{ color: '#666' }}>马拉松赛事信息整理与发布管理后台。</p>
      <p>
        查看 <Link to="/logs">操作日志</Link>
      </p>
    </div>
  );
}

export function SettingsPage() {
  const { can } = useAdmin();
  const tabItems = [
    { key: 'compliance', label: '合规文案', children: <ComplianceTab /> },
    { key: 'about', label: '关于', children: <AboutTab /> },
  ];
  if (can('manage_settings')) {
    tabItems.splice(1, 0, { key: 'admin', label: '管理员管理', children: <AdminTab /> });
  }
  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">系统设置</h1>
          <div className="page-subtitle">合规文案、管理员账号与系统信息</div>
        </div>
      </div>
      <Tabs defaultActiveKey="compliance" items={tabItems} />
    </main>
  );
}
