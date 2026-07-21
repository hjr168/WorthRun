import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../api';
import { useAdmin } from '../context/AdminContext';
import type { ReleaseChangeCategory, ReleaseNoteItem } from '../types';
import { showError } from '../utils/helpers';

interface ReleaseFormValues {
  version: string;
  title: string;
  summary?: string;
  releasedAt: Dayjs;
  changes: Array<{ category: ReleaseChangeCategory; description: string }>;
}

const statusLabels = { draft: '草稿', published: '已发布', offline: '已下线' };
const statusColors = { draft: 'default', published: 'green', offline: 'orange' } as const;
const categoryLabels = { feature: '新功能', improvement: '体验优化', fix: '问题修复' };

export function ReleaseNotesPage() {
  const { can } = useAdmin();
  const [items, setItems] = useState<ReleaseNoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ReleaseNoteItem | 'new' | null>(null);
  const [preview, setPreview] = useState<ReleaseNoteItem | null>(null);
  const [form] = Form.useForm<ReleaseFormValues>();

  const load = () => {
    setLoading(true);
    apiGet<{ items: ReleaseNoteItem[] }>('/api/admin/release-notes')
      .then((result) => setItems(result.items))
      .catch(showError)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => {
    setEditing('new');
    form.setFieldsValue({
      version: '',
      title: '',
      summary: '',
      releasedAt: dayjs(),
      changes: [{ category: 'feature', description: '' }],
    });
  };
  const openEdit = (item: ReleaseNoteItem) => {
    setEditing(item);
    form.setFieldsValue({
      ...item,
      summary: item.summary || '',
      releasedAt: dayjs(item.releasedAt),
    });
  };
  const submit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      version: values.version.toUpperCase(),
      releasedAt: values.releasedAt.toISOString(),
    };
    if (editing === 'new') await apiSend('POST', '/api/admin/release-notes', payload);
    else if (editing) await apiSend('PUT', `/api/admin/release-notes/${editing.id}`, payload);
    message.success(editing === 'new' ? '更新日志草稿已创建' : '更新日志已保存');
    setEditing(null);
    form.resetFields();
    load();
  };
  const changeStatus = async (item: ReleaseNoteItem, action: 'publish' | 'offline') => {
    await apiSend('PATCH', `/api/admin/release-notes/${item.id}/status`, { action });
    message.success(action === 'publish' ? '已发布' : '已下线');
    load();
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">版本更新</h1>
          <div className="page-subtitle">维护小程序更新时间线，草稿确认后才对用户可见</div>
        </div>
        {can('edit_release_notes') && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建草稿
          </Button>
        )}
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={[
          {
            title: '版本',
            dataIndex: 'version',
            width: 110,
            render: (value) => <strong>{value}</strong>,
          },
          { title: '标题', dataIndex: 'title' },
          {
            title: '更新时间',
            dataIndex: 'releasedAt',
            width: 150,
            render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (value: ReleaseNoteItem['status']) => (
              <Tag color={statusColors[value]}>{statusLabels[value]}</Tag>
            ),
          },
          {
            title: '条目',
            dataIndex: 'changes',
            width: 80,
            render: (value: unknown[]) => value.length,
          },
          {
            title: '操作',
            width: 260,
            render: (_, item) => (
              <Space wrap>
                <Button size="small" onClick={() => setPreview(item)}>
                  预览
                </Button>
                {can('edit_release_notes') && item.status !== 'published' && (
                  <Button size="small" onClick={() => openEdit(item)}>
                    编辑
                  </Button>
                )}
                {can('publish_release_notes') && item.status !== 'published' && (
                  <Popconfirm
                    title="确认立即发布？"
                    onConfirm={() => changeStatus(item, 'publish')}
                  >
                    <Button size="small" type="primary">
                      发布
                    </Button>
                  </Popconfirm>
                )}
                {can('publish_release_notes') && item.status === 'published' && (
                  <Popconfirm
                    title="下线后用户将不再看到该日志，继续？"
                    onConfirm={() => changeStatus(item, 'offline')}
                  >
                    <Button size="small" danger>
                      下线
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing === 'new' ? '新建更新日志' : `编辑 ${editing && editing.version}`}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={submit}
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <div className="form-grid">
            <Form.Item
              name="version"
              label="版本号"
              rules={[
                { required: true },
                { pattern: /^V\d+\.\d+\.\d+$/i, message: '格式应为 Vx.y.z' },
              ]}
            >
              <Input placeholder="V0.5.2" />
            </Form.Item>
            <Form.Item name="releasedAt" label="业务更新时间" rules={[{ required: true }]}>
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="title" label="标题" rules={[{ required: true }, { max: 80 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="summary" label="摘要" rules={[{ max: 500 }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.List
            name="changes"
            rules={[
              {
                validator: async (_, value) => {
                  if (!value?.length) throw new Error('请至少填写一项更新');
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                <div className="field-label">更新条目</div>
                {fields.map((field) => (
                  <Space
                    key={field.key}
                    align="baseline"
                    style={{ display: 'flex', marginBottom: 8 }}
                  >
                    <Form.Item
                      {...field}
                      name={[field.name, 'category']}
                      rules={[{ required: true }]}
                    >
                      <Select
                        style={{ width: 120 }}
                        options={Object.entries(categoryLabels).map(([value, label]) => ({
                          value,
                          label,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'description']}
                      rules={[{ required: true, message: '请填写说明' }, { max: 200 }]}
                    >
                      <Input style={{ width: 480 }} placeholder="这次改了什么" />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(field.name)} />
                  </Space>
                ))}
                <Form.ErrorList errors={errors} />
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ category: 'improvement', description: '' })}
                >
                  添加条目
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title={`${preview?.version || ''} ${preview?.title || ''}`}
        open={Boolean(preview)}
        footer={null}
        onCancel={() => setPreview(null)}
      >
        {preview && (
          <Card bordered={false}>
            <div style={{ color: '#64748B', marginBottom: 12 }}>
              {dayjs(preview.releasedAt).format('YYYY-MM-DD HH:mm')}
            </div>
            {preview.summary && <p>{preview.summary}</p>}
            <Space direction="vertical" style={{ width: '100%' }}>
              {preview.changes.map((change, index) => (
                <div key={`${change.category}-${index}`}>
                  <Tag>{categoryLabels[change.category]}</Tag>
                  {change.description}
                </div>
              ))}
            </Space>
          </Card>
        )}
      </Modal>
    </main>
  );
}
