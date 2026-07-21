import {
  Alert,
  Button,
  Card,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  defaultShareSettings,
  resolveShareTitle,
  shareSceneValues,
  type ShareScene,
  type ShareSettings,
} from '@worth-running/shared';
import { apiGet, apiSend } from '../api';
import { useAdmin } from '../context/AdminContext';
import type { EventShareOverrideRow } from '../types';
import { showError } from '../utils/helpers';
import { ShareStatsPage } from './ShareStatsPage';

const sceneLabels: Record<ShareScene, string> = {
  home: '首页',
  events: '赛事列表',
  event_detail: '赛事详情',
  tools: '跑前工具',
  source_summary: '来源摘要',
  release_notes: '版本更新',
};

const sampleVariables = {
  eventName: '深圳马拉松',
  city: '深圳',
  eventDate: '2026-12-06',
  distance: '全马、半马',
  judgement: '适合优先关注',
  latestVersion: 'V0.5.2',
};

function SharePreview({ title, imageUrl }: { title: string; imageUrl: string }) {
  const external = /^https:\/\//.test(imageUrl);
  return (
    <div className="share-preview">
      <div className="share-preview-copy">{title}</div>
      {external ? (
        <Image
          src={imageUrl}
          width="100%"
          height={160}
          style={{ objectFit: 'cover' }}
          fallback="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
        />
      ) : (
        <div className="share-preview-art">
          <span>哪场值得跑</span>
          <strong>
            {imageUrl.includes('event')
              ? '赛事决策卡'
              : imageUrl.includes('tools')
                ? '跑前工具'
                : imageUrl.includes('release')
                  ? '新版本已到达'
                  : '跑一场更适合你的比赛'}
          </strong>
        </div>
      )}
    </div>
  );
}

function GlobalSettingsTab() {
  const { can } = useAdmin();
  const [settings, setSettings] = useState<ShareSettings>(defaultShareSettings);
  const [allowedHosts, setAllowedHosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    apiGet<{ settings: ShareSettings; allowedHosts: string[] }>('/api/admin/share-settings')
      .then((result) => {
        setSettings(result.settings);
        setAllowedHosts(result.allowedHosts);
      })
      .catch(showError)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const updateScene = (scene: ShareScene, key: 'titleTemplate' | 'imageUrl', value: string) => {
    setSettings((current) => ({
      ...current,
      scenes: { ...current.scenes, [scene]: { ...current.scenes[scene], [key]: value } },
    }));
  };

  const save = () => {
    setSaving(true);
    apiSend<{ settings: ShareSettings }>('PUT', '/api/admin/share-settings', {
      scenes: settings.scenes,
    })
      .then((result) => {
        setSettings(result.settings);
        message.success('全局分享设置已保存');
      })
      .catch(showError)
      .finally(() => setSaving(false));
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="图片规则"
        description={
          allowedHosts.length
            ? `支持内置图片，或以下 HTTPS 域名：${allowedHosts.join('、')}`
            : '当前未配置外部图片域名，只能使用内置图片。'
        }
      />
      {shareSceneValues.map((scene) => {
        const value = settings.scenes[scene];
        return (
          <Card key={scene} title={sceneLabels[scene]} loading={loading}>
            <div className="share-setting-grid">
              <div>
                <div className="field-label">标题模板</div>
                <Input
                  value={value.titleTemplate}
                  disabled={!can('manage_settings')}
                  onChange={(event) => updateScene(scene, 'titleTemplate', event.target.value)}
                />
                <div className="field-help">
                  可用变量：
                  {'{eventName} {city} {eventDate} {distance} {judgement} {latestVersion}'}
                </div>
                <div className="field-label" style={{ marginTop: 14 }}>
                  图片路径 / HTTPS URL
                </div>
                <Input
                  value={value.imageUrl}
                  disabled={!can('manage_settings')}
                  onChange={(event) => updateScene(scene, 'imageUrl', event.target.value)}
                />
                <div className="field-help">建议 500×400 JPG，关键文字距边缘至少 32px。</div>
              </div>
              <SharePreview
                title={resolveShareTitle(value.titleTemplate, sampleVariables)}
                imageUrl={value.imageUrl}
              />
            </div>
          </Card>
        );
      })}
      {can('manage_settings') && (
        <Space>
          <Button type="primary" loading={saving} onClick={save}>
            保存全局设置
          </Button>
          <Button onClick={() => setSettings(defaultShareSettings)}>恢复内置默认</Button>
        </Space>
      )}
    </Space>
  );
}

function EventOverridesTab() {
  const { can } = useAdmin();
  const canEdit = can('edit_event');
  const [items, setItems] = useState<EventShareOverrideRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<EventShareOverrideRow | null>(null);
  const [form] = Form.useForm<{ titleTemplate?: string; imageUrl?: string }>();

  const load = (nextPage = page, nextSearch = search) => {
    setLoading(true);
    apiGet<{ items: EventShareOverrideRow[]; total: number }>(
      `/api/admin/event-share-overrides?page=${nextPage}&pageSize=20&search=${encodeURIComponent(nextSearch)}`,
    )
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch(showError)
      .finally(() => setLoading(false));
  };
  useEffect(() => load(), [page]);

  const open = (row: EventShareOverrideRow) => {
    setTarget(row);
    form.setFieldsValue({
      titleTemplate: row.shareOverride?.titleTemplate || '',
      imageUrl: row.shareOverride?.imageUrl || '',
    });
  };

  const save = async () => {
    if (!target) return;
    const values = await form.validateFields();
    await apiSend('PUT', `/api/admin/events/${target.id}/share-override`, {
      titleTemplate: values.titleTemplate?.trim() || null,
      imageUrl: values.imageUrl?.trim() || null,
    });
    message.success('赛事分享覆盖已保存');
    setTarget(null);
    load();
  };

  const clear = async (row: EventShareOverrideRow) => {
    await apiSend('DELETE', `/api/admin/events/${row.id}/share-override`);
    message.success('已恢复继承全局设置');
    load();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="搜索赛事"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onSearch={(value) => {
            setPage(1);
            setSearch(value);
            load(1, value);
          }}
          style={{ width: 320 }}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={{ current: page, pageSize: 20, total, onChange: setPage }}
        columns={[
          { title: '赛事', dataIndex: 'eventName' },
          { title: '城市', dataIndex: 'city', width: 100 },
          {
            title: '状态',
            dataIndex: 'publishStatus',
            width: 110,
            render: (value) => <Tag>{value}</Tag>,
          },
          {
            title: '分享配置',
            width: 150,
            render: (_, row) =>
              row.shareOverride ? <Tag color="green">已覆盖</Tag> : <Tag>继承全局</Tag>,
          },
          {
            title: '操作',
            width: 180,
            render: (_, row) =>
              canEdit ? (
                <Space>
                  <Button size="small" onClick={() => open(row)}>
                    编辑
                  </Button>
                  {row.shareOverride && (
                    <Popconfirm title="确认清除覆盖？" onConfirm={() => clear(row)}>
                      <Button size="small">清除</Button>
                    </Popconfirm>
                  )}
                </Space>
              ) : (
                '-'
              ),
          },
        ]}
      />
      <Modal
        title={`赛事分享覆盖：${target?.eventName || ''}`}
        open={Boolean(target)}
        onCancel={() => setTarget(null)}
        onOk={save}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="titleTemplate" label="标题模板" extra="留空则继承全局赛事详情模板">
            <Input placeholder="例如：一起跑 {eventName}" />
          </Form.Item>
          <Form.Item name="imageUrl" label="HTTPS 图片 URL" extra="留空则继承全局赛事图片">
            <Input placeholder="https://.../share.jpg" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ShareCenterPage() {
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') || 'settings';
  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">分享中心</h1>
          <div className="page-subtitle">管理原生分享标题、图片、单赛事覆盖与发起数据</div>
        </div>
      </div>
      <Tabs
        activeKey={active}
        onChange={(tab) => setParams({ tab })}
        items={[
          { key: 'settings', label: '全局设置', children: <GlobalSettingsTab /> },
          { key: 'events', label: '赛事覆盖', children: <EventOverridesTab /> },
          { key: 'stats', label: '数据统计', children: <ShareStatsPage embedded /> },
        ]}
      />
    </main>
  );
}
