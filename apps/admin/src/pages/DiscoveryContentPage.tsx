import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  List,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
  message,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PictureOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../api';
import { showError, formatBytes } from '../utils/helpers';

type MediaAsset = {
  id: string;
  eventId?: string | null;
  candidateId?: string | null;
  originalUrl?: string | null;
  sourcePageUrl: string;
  attribution?: string | null;
  reviewNote?: string | null;
  cloudbaseFileId?: string | null;
  thumbnailFileId?: string | null;
  previewUrl?: string | null;
  thumbnailPreviewUrl?: string | null;
  reviewStatus: string;
  isPrimary: boolean;
  sha256: string;
  mediaUploadStatus?: string;
  width?: number | null;
  height?: number | null;
  processedBySharp?: boolean | null;
  originalBytes?: number | null;
  heroBytes?: number | null;
  thumbnailBytes?: number | null;
};
type AdminEvent = {
  id: string;
  eventName: string;
  city: string;
  eventDate: string;
  publishStatus: string;
  signupStatus?: string;
  officialUrl: string;
  sourceUrl?: string | null;
};
type Candidate = {
  id: string;
  eventName: string;
  city: string;
  eventDate?: string | null;
  officialUrl?: string | null;
  sourceUrl?: string | null;
  status: string;
};
type EditorialItem = {
  id?: string;
  eventId: string;
  section: string;
  rank: number;
  note?: string | null;
};

const sections = [
  { value: 'focus', label: '焦点赛事' },
  { value: 'editors_pick', label: '本月值得去' },
  { value: 'signup_soon', label: '即将开报' },
  { value: 'recommended', label: '为你推荐' },
];

/** 与小程序首页 monthOffset 保持一致（UTC），用于后台编排对齐小程序四个月份 tab。 */
function monthOffset(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
}

/** 简单日期格式化：ISO -> M月D日，便于运营阅读。 */
function formatEventDate(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

const signupStatusLabels: Record<string, string> = {
  not_started: '未开始',
  open: '报名中',
  closing_soon: '即将截止',
  closed: '已截止',
  unknown: '未知',
};

const reviewStatusLabels: Record<string, { label: string; color: string }> = {
  pending_review: { label: '待审核', color: 'orange' },
  approved_for_display: { label: '已批准', color: 'green' },
  rejected: { label: '已驳回', color: 'red' },
};

async function loadNewCandidates(page = 1, collected: Candidate[] = []): Promise<Candidate[]> {
  const result = await apiGet<{ items: Candidate[]; total: number }>(
    `/api/admin/event-candidates?page=${page}&pageSize=50&status=new`,
  );
  const items = [...collected, ...result.items];
  if (items.length >= result.total || result.items.length < 50 || page >= 10) return items;
  return loadNewCandidates(page + 1, items);
}

export function DiscoveryContentPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  // 默认对齐小程序首页默认 tab（未来第 3 个月），避免编辑的月份与小程序展示不一致。
  const [month, setMonth] = useState(monthOffset(3));
  const [items, setItems] = useState<EditorialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mediaForm] = Form.useForm();
  const [imageCandidates, setImageCandidates] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editorialEventId, setEditorialEventId] = useState('');
  const [editorialSection, setEditorialSection] = useState('editors_pick');
  const [activeTab, setActiveTab] = useState('media');

  const reload = () => {
    setLoading(true);
    Promise.all([
      apiGet<{ items: MediaAsset[] }>('/api/admin/media-assets'),
      apiGet<{ items: AdminEvent[] }>(
        '/api/admin/events?page=1&pageSize=100&publishStatus=published',
      ),
      loadNewCandidates(),
      apiGet<{ items: EditorialItem[] }>(
        `/api/admin/home-editorial?month=${encodeURIComponent(month)}`,
      ),
    ])
      .then(([media, eventResult, candidateItems, editorial]) => {
        setAssets(media.items);
        setEvents(eventResult.items);
        setCandidates(candidateItems);
        setItems(
          editorial.items.map(({ id, eventId, section, rank, note }) => ({
            id,
            eventId,
            section,
            rank,
            note,
          })),
        );
      })
      .catch(showError)
      .finally(() => setLoading(false));
  };
  useEffect(reload, [month]);
  useEffect(() => {
    // 支持从赛事列表「图片」按钮跳转过来：预选赛事并切到媒体审核 tab。
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('eventId');
    const candidateId = params.get('candidateId');
    const tab = params.get('tab');
    if (eventId) mediaForm.setFieldsValue({ eventId });
    if (candidateId) mediaForm.setFieldsValue({ candidateId });
    if (tab === 'media' || eventId || candidateId) setActiveTab('media');
  }, [mediaForm]);

  const discover = async () => {
    try {
      const values = await mediaForm.validateFields(['pageUrl', 'officialUrl']);
      const result = await apiSend<{ pageUrl: string; candidates: string[] }>(
        'POST',
        '/api/admin/media-assets/discover',
        {
          ...values,
          eventId: values.eventId || null,
          candidateId: values.candidateId || null,
        },
      );
      setImageCandidates(result.candidates);
      setSelectedImage(result.candidates[0] || '');
      if (!result.candidates.length) message.warning('来源页没有发现可审核图片');
    } catch (error) {
      showError(error);
    }
  };

  const createAsset = async () => {
    try {
      const values = await mediaForm.validateFields([
        'eventId',
        'candidateId',
        'pageUrl',
        'attribution',
        'rightsNote',
      ]);
      if (!selectedImage) {
        message.warning('请先选择候选图片');
        return;
      }
      await apiSend('POST', '/api/admin/media-assets', {
        eventId: values.eventId || null,
        candidateId: values.candidateId || null,
        imageUrl: selectedImage,
        sourcePageUrl: values.pageUrl,
        attribution: values.attribution || null,
        rightsNote: values.rightsNote || null,
      });
      message.success('图片已下载并进入审核队列');
      setImageCandidates([]);
      setSelectedImage('');
      reload();
    } catch (error) {
      showError(error);
    }
  };

  const uploadAsset = async () => {
    try {
      const values = await mediaForm.validateFields(['eventId', 'candidateId', 'attribution']);
      if (!uploadFile) {
        message.warning('请先选择图片文件');
        return;
      }
      if (!values.eventId && !values.candidateId) {
        message.warning('请先选择关联的赛事或候选');
        return;
      }
      setUploading(true);
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(uploadFile);
      });
      await apiSend('POST', '/api/admin/media-assets/upload', {
        eventId: values.eventId || null,
        candidateId: values.candidateId || null,
        imageBase64,
        fileName: uploadFile.name,
        attribution: values.attribution,
        rightsNote: mediaForm.getFieldValue('rightsNote') || null,
      });
      message.success('图片已上传，进入审核队列');
      setUploadFile(null);
      setUploadPreview('');
      mediaForm.setFieldsValue({ attribution: undefined, rightsNote: undefined });
      reload();
    } catch (error) {
      showError(error);
    } finally {
      setUploading(false);
    }
  };

  const retryUpload = (id: string) =>
    apiSend('POST', `/api/admin/media-assets/${id}/retry-upload`)
      .then(() => {
        message.success('媒体已重新上传，等待人工审核');
        reload();
      })
      .catch(showError);
  const review = (id: string, action: 'approve' | 'reject' | 'primary') =>
    apiSend('POST', `/api/admin/media-assets/${id}/review`, { action })
      .then(() => {
        message.success('媒体审核状态已保存');
        reload();
      })
      .catch(showError);
  const addEditorial = (eventId: string, section: string) => {
    if (items.some((item) => item.eventId === eventId && item.section === section)) return;
    setItems((current) => [
      ...current,
      { eventId, section, rank: current.filter((item) => item.section === section).length },
    ]);
  };
  const moveItem = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length || items[target].section !== items[index].section)
      return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(
      next.map((item, itemIndex) => ({
        ...item,
        rank: next.slice(0, itemIndex + 1).filter((row) => row.section === item.section).length - 1,
      })),
    );
  };
  const saveEditorial = () =>
    apiSend('PUT', '/api/admin/home-editorial', { month, items })
      .then(() => message.success('首页编排已保存'))
      .catch(showError);
  // 焦点赛事必须有 approved 且已上传 CloudBase 的图片，否则后端会 400。这里前端预检并禁用保存。
  const focusMissingImage = items.some(
    (item) =>
      item.section === 'focus' &&
      !assets.some(
        (asset) =>
          asset.eventId === item.eventId &&
          asset.reviewStatus === 'approved_for_display' &&
          asset.cloudbaseFileId,
      ),
  );

  const mediaTab = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title="赛事图片处理"
        extra={
          <Button icon={<ReloadOutlined />} onClick={reload}>
            刷新
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          message="候选图按完整画面预览，避免横幅文字被裁切；CloudBase 未配置时公共端只显示品牌默认封面，原图来源与权利说明保留在后台。"
        />
        <Form form={mediaForm} layout="vertical" style={{ marginTop: 16 }}>
          <Space wrap align="start" style={{ width: '100%' }}>
            <Form.Item name="eventId" label="已发布赛事" className="discovery-field">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="选择赛事"
                options={events.map((event) => ({
                  value: event.id,
                  label: `${event.eventName} · ${event.city}`,
                  officialUrl: event.officialUrl,
                  sourceUrl: event.sourceUrl,
                }))}
                onChange={(id) => {
                  const event = events.find((item) => item.id === id);
                  if (event)
                    mediaForm.setFieldsValue({
                      officialUrl: event.officialUrl,
                      sourceUrl: event.sourceUrl || undefined,
                    });
                }}
              />
            </Form.Item>
            <Form.Item name="candidateId" label="候选赛事" className="discovery-field">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="或选择候选"
                options={candidates.map((candidate) => ({
                  value: candidate.id,
                  label: `${candidate.eventName} · ${candidate.city}`,
                  officialUrl: candidate.officialUrl,
                  sourceUrl: candidate.sourceUrl,
                }))}
                onChange={(id) => {
                  const candidate = candidates.find((item) => item.id === id);
                  if (candidate)
                    mediaForm.setFieldsValue({
                      officialUrl: candidate.officialUrl,
                      sourceUrl: candidate.sourceUrl || undefined,
                    });
                }}
              />
            </Form.Item>
            <Form.Item
              name="pageUrl"
              label="确认来源页"
              rules={[{ required: true, type: 'url' }]}
              className="discovery-field discovery-field-wide"
            >
              <Input placeholder="官网或主办方确认页面" />
            </Form.Item>
          </Space>
          <Space wrap align="start" style={{ width: '100%' }}>
            <Form.Item
              name="officialUrl"
              label="官方入口"
              rules={[{ required: true, type: 'url' }]}
              className="discovery-field discovery-field-wide"
            >
              <Input placeholder="用于域名白名单校验" />
            </Form.Item>
            <Form.Item
              name="sourceUrl"
              label="主办方来源页"
              className="discovery-field discovery-field-wide"
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="attribution"
              label="署名"
              rules={[{ required: true, message: '请填写图片署名' }]}
              className="discovery-field"
            >
              <Input placeholder="摄影/主办方署名" />
            </Form.Item>
            <Form.Item
              name="rightsNote"
              label="权利说明"
              className="discovery-field discovery-field-wide"
            >
              <Input placeholder="已确认展示授权/来源许可依据" />
            </Form.Item>
          </Space>
          <Space wrap className="discovery-actions">
            <Button icon={<PictureOutlined />} onClick={discover}>
              发现候选图片
            </Button>
            <Button type="primary" disabled={!selectedImage} onClick={createAsset}>
              下载并上传 CloudBase
            </Button>
          </Space>

          <div className="upload-divider">或 直接上传本地图片</div>
          <Space wrap align="center">
            <Upload
              accept="image/jpeg,image/png,image/webp"
              showUploadList={false}
              beforeUpload={(file) => {
                if (file.size > 8 * 1024 * 1024) {
                  message.error('图片不能超过 8MB');
                  return Upload.LIST_IGNORE;
                }
                setUploadFile(file);
                setUploadPreview(URL.createObjectURL(file));
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>选择图片</Button>
            </Upload>
            {uploadPreview && (
              <img
                src={uploadPreview}
                alt="上传预览"
                className="media-asset-preview"
                style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8 }}
              />
            )}
            <Button
              type="primary"
              loading={uploading}
              disabled={!uploadFile}
              onClick={uploadAsset}
            >
              上传图片
            </Button>
            {uploadFile && (
              <Button
                type="link"
                onClick={() => {
                  setUploadFile(null);
                  setUploadPreview('');
                }}
              >
                清除
              </Button>
            )}
          </Space>
        </Form>
        {!!imageCandidates.length && (
          <List
            style={{ marginTop: 16 }}
            grid={{ gutter: 12, xs: 1, sm: 2, md: 3, xl: 4 }}
            dataSource={imageCandidates}
            renderItem={(url) => (
              <List.Item>
                <Card
                  size="small"
                  hoverable
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedImage === url}
                  onClick={() => setSelectedImage(url)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedImage(url);
                    }
                  }}
                  className={
                    selectedImage === url
                      ? 'media-candidate-card is-selected'
                      : 'media-candidate-card'
                  }
                >
                  <img src={url} alt="候选图片完整预览" className="media-candidate-image" />
                  <div className="media-candidate-url">
                    {selectedImage === url ? '已选择 · ' : ''}
                    {url}
                  </div>
                </Card>
              </List.Item>
            )}
          />
        )}
      </Card>
      <Card loading={loading}>
        <Table
          rowKey="id"
          dataSource={assets}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1100 }}
          columns={[
            {
              title: '预览',
              render: (_, row) => (
                <Space direction="vertical" size={4}>
                  {row.thumbnailPreviewUrl ? (
                    <img
                      src={row.thumbnailPreviewUrl}
                      alt="赛事媒体完整预览"
                      className="media-asset-preview"
                    />
                  ) : (
                    <Tag color="orange">
                      {row.mediaUploadStatus === 'pending_retry' ? '待重试' : '待配置'}
                    </Tag>
                  )}
                  <span className="media-dimensions">
                    {row.width && row.height ? `${row.width} × ${row.height}` : '尺寸待识别'}
                  </span>
                  {row.cloudbaseFileId ? (
                    <Space size={4} wrap>
                      <Tag color="green">已上传</Tag>
                      {row.processedBySharp === false ? (
                        <Tag color="red" title="云函数 sharp 未生效，主图与缩略图实际为未压缩原图，需检查部署">
                          未压缩
                        </Tag>
                      ) : row.processedBySharp === true ? (
                        <Tag color="blue">已压缩</Tag>
                      ) : null}
                      {row.heroBytes ? (
                        <span className="media-dimensions">
                          主图 {formatBytes(row.heroBytes)}
                          {row.thumbnailBytes ? ` · 缩略 ${formatBytes(row.thumbnailBytes)}` : ''}
                          {row.originalBytes ? ` · 原图 ${formatBytes(row.originalBytes)}` : ''}
                        </span>
                      ) : null}
                    </Space>
                  ) : null}
                </Space>
              ),
            },
            { title: '关联', render: (_, row) => row.eventId || row.candidateId || '-' },
            {
              title: '来源页',
              render: (_, row) => (
                <a href={row.sourcePageUrl} target="_blank" rel="noreferrer">
                  查看来源
                </a>
              ),
            },
            {
              title: '署名/权利说明',
              render: (_, row) => (
                <span>
                  {row.attribution || '-'}
                  {row.reviewNote ? ` · ${row.reviewNote}` : ''}
                </span>
              ),
            },
            {
              title: '状态',
              render: (_, row) => {
                const status = reviewStatusLabels[row.reviewStatus] || {
                  label: row.reviewStatus,
                  color: 'default',
                };
                return (
                  <Space direction="vertical" size={4}>
                    <Tag color={status.color}>{status.label}</Tag>
                    {row.isPrimary && (
                      <Tag color="gold">主图</Tag>
                    )}
                  </Space>
                );
              },
            },
            {
              title: '操作',
              render: (_, row) => {
                const canReview = Boolean(row.cloudbaseFileId && row.thumbnailFileId);
                const approved = row.reviewStatus === 'approved_for_display';
                const rejected = row.reviewStatus === 'rejected';
                return (
                  <Space wrap>
                    <Button
                      size="small"
                      onClick={() => retryUpload(row.id)}
                      disabled={Boolean(row.cloudbaseFileId) || !row.originalUrl}
                    >
                      重试上传
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      disabled={!canReview || approved}
                      onClick={() => review(row.id, 'approve')}
                    >
                      {approved ? '已批准' : '批准'}
                    </Button>
                    <Button
                      size="small"
                      disabled={!canReview || row.isPrimary}
                      onClick={() => review(row.id, 'primary')}
                    >
                      {row.isPrimary ? '当前主图' : '设主图'}
                    </Button>
                    <Button
                      size="small"
                      danger
                      disabled={rejected}
                      onClick={() => review(row.id, 'reject')}
                    >
                      驳回
                    </Button>
                  </Space>
                );
              },
            },
          ]}
        />
      </Card>
    </Space>
  );

  const editorialTab = (
    <Card
      title="首页月度编排"
      extra={
        <Space>
          <Select
            style={{ width: 220 }}
            value={month}
            onChange={setMonth}
            options={[1, 2, 3, 4].map((offset) => {
              const value = monthOffset(offset);
              return {
                value,
                label: `${value.slice(0, 4)}年${value.slice(5)}月${offset === 3 ? '（小程序首页默认）' : ''}`,
              };
            })}
          />
          <Button type="primary" disabled={focusMissingImage} onClick={saveEditorial}>
            保存编排
          </Button>
        </Space>
      }
    >
      <Alert
        type={focusMissingImage ? 'warning' : 'info'}
        showIcon
        message={
          focusMissingImage
            ? '存在缺少焦点图的焦点赛事，保存已禁用：请先在「媒体审核」完成图片 approved 与 CloudBase 上传。'
            : '小程序首页默认展示「未来第 3 个月」的编排；焦点赛事必须具备 approved 图片且已上传 CloudBase，赛事最终发布仍由 event_operator 执行。'
        }
      />
      <Space wrap style={{ margin: '16px 0' }}>
        <Select
          showSearch
          value={editorialEventId || undefined}
          style={{ width: 320 }}
          placeholder="添加已发布赛事"
          optionFilterProp="label"
          options={events.map((event) => ({
            value: event.id,
            label: `${event.eventName} · ${event.city}`,
          }))}
          onChange={setEditorialEventId}
        />
        <Select
          value={editorialSection}
          style={{ width: 160 }}
          options={sections}
          onChange={setEditorialSection}
        />
        <Button
          onClick={() => {
            if (editorialEventId) addEditorial(editorialEventId, editorialSection);
          }}
        >
          添加到分区
        </Button>
      </Space>
      <Table
        rowKey={(row) => `${row.section}-${row.eventId}`}
        dataSource={items}
        pagination={false}
        columns={[
          {
            title: '分区',
            render: (_, row) =>
              sections.find((item) => item.value === row.section)?.label || row.section,
          },
          {
            title: '赛事',
            render: (_, row) =>
              events.find((event) => event.id === row.eventId)?.eventName || row.eventId,
          },
          {
            title: '日期',
            render: (_, row) =>
              formatEventDate(events.find((event) => event.id === row.eventId)?.eventDate),
          },
          {
            title: '城市',
            render: (_, row) => events.find((event) => event.id === row.eventId)?.city || '-',
          },
          {
            title: '报名',
            render: (_, row) => {
              const status = events.find((event) => event.id === row.eventId)?.signupStatus;
              return status ? signupStatusLabels[status] || status : '-';
            },
          },
          {
            title: '配图',
            render: (_, row) => {
              if (row.section !== 'focus') return '-';
              const ready = assets.some(
                (asset) =>
                  asset.eventId === row.eventId &&
                  asset.reviewStatus === 'approved_for_display' &&
                  asset.cloudbaseFileId,
              );
              return ready ? (
                <Tag color="green">已就绪</Tag>
              ) : (
                <Tag color="red">缺焦点图</Tag>
              );
            },
          },
          { title: '排序', dataIndex: 'rank' },
          {
            title: '操作',
            render: (_, row, index) => (
              <Space>
                <Button
                  size="small"
                  icon={<ArrowUpOutlined />}
                  onClick={() => moveItem(index, -1)}
                />
                <Button
                  size="small"
                  icon={<ArrowDownOutlined />}
                  onClick={() => moveItem(index, 1)}
                />
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                />
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">全国发现内容</h1>
          <div className="page-subtitle">
            候选赛事和独立发现内容共用来源页、媒体权利、CloudBase 上传与人工审核链路。
          </div>
        </div>
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'media', label: '媒体审核', children: mediaTab },
          { key: 'editorial', label: '首页编排', children: editorialTab },
        ]}
      />
    </main>
  );
}
