import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { EditOutlined, FileDoneOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiSend } from '../api';
import { AdminEvent, EventSourceSummaryItem, OperationLog } from '../types';
import {
  infoStatusOptions,
  publishStatusOptions,
  runJudgementOptions,
  signupStatusOptions,
  sourceLevelOptions,
} from '../constants';
import { showError } from '../utils/helpers';
import { defaultChecklist, splitComma, splitLines } from '../utils/form';
import { Section } from '../components/Section';
import { OperationLogTable } from '../components/OperationLogTable';
import { MiniappPublishChecks } from '../components/MiniappPublishChecks';
import { useConfig } from '../hooks/useConfig';
import { DEFAULT_CITIES, DEFAULT_DISTANCES } from './ContentPage';
import { useAdmin } from '../context/AdminContext';

const { TextArea } = Input;

export function EventEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const { value: cityOptions } = useConfig<string[]>('available_cities', DEFAULT_CITIES);
  const { value: distanceOptions } = useConfig<string[]>('distance_options', DEFAULT_DISTANCES);

  useEffect(() => {
    if (!id) return;
    apiGet<AdminEvent>(`/api/admin/events/${id}`)
      .then((event) => {
        form.setFieldsValue({
          ...event,
          city: event.city ? [event.city] : [],
          eventDate: event.eventDate ? dayjs(event.eventDate).format('YYYY-MM-DD') : undefined,
          signupStartAt: event.signupStartAt
            ? dayjs(event.signupStartAt).format('YYYY-MM-DDTHH:mm')
            : undefined,
          signupDeadline: event.signupDeadline
            ? dayjs(event.signupDeadline).format('YYYY-MM-DDTHH:mm')
            : undefined,
          distanceItems: event.distanceItems,
          judgementReasons: event.judgementReasons.join('\n'),
          suitableFor: event.suitableFor.join('\n'),
          notSuitableFor: event.notSuitableFor.join('\n'),
          tags: event.tags.join(', '),
          checklistItems: event.checklistItems,
        });
      })
      .catch(showError);
    apiGet<{ items: OperationLog[] }>(`/api/admin/operation-logs?targetType=events&targetId=${id}`)
      .then((result) => setLogs(result.items))
      .catch(showError);
  }, [form, id]);

  const submit = async () => {
    // Tabs only mount their active panel on first visit. validateFields() returns
    // the mounted fields, so using its return value here could omit values already
    // loaded into the "跑前判断" and "来源与发布" tabs when saving from another tab.
    await form.validateFields();
    const values = form.getFieldsValue(true);
    const body = {
      ...values,
      city: Array.isArray(values.city) ? values.city[0] : values.city,
      distanceItems: values.distanceItems || [],
      judgementReasons: splitLines(values.judgementReasons),
      suitableFor: splitLines(values.suitableFor),
      notSuitableFor: splitLines(values.notSuitableFor),
      tags: splitComma(values.tags),
      checklistItems: values.checklistItems || [],
      eventTags: splitComma(values.tags).map((tagName) => ({ tagName, tagType: 'experience' })),
      fieldConfidence: {
        signupDeadline: values.signupDeadline ? 'verified' : 'pending_verify',
        route: 'pending_verify',
        weather: 'pending_verify',
      },
    };
    setLoading(true);
    try {
      if (id) {
        await apiSend('PUT', `/api/admin/events/${id}`, body);
      } else {
        await apiSend('POST', '/api/admin/events', body);
      }
      message.success('保存成功');
      navigate('/events');
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{id ? '编辑赛事' : '新增赛事'}</h1>
          <div className="page-subtitle">
            所有赛事信息必须保留“AI 整理，仅供参考，报名以官方为准”提示
          </div>
        </div>
        <Space>
          <Button onClick={() => navigate('/events')}>返回</Button>
          <Button type="primary" loading={loading} onClick={submit}>
            保存
          </Button>
        </Space>
      </div>
      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            signupStatus: 'unknown',
            publishStatus: 'draft',
            infoStatus: 'pending_verify',
            runJudgement: 'unverified',
            sourceLevel: 'official',
            checklistItems: defaultChecklist(),
          }}
        >
          <Tabs
            items={[
              {
                key: 'base',
                label: '基础信息',
                children: (
                  <>
                    <Section title="基础信息">
                      <div className="form-grid">
                        <Form.Item label="赛事名称" name="eventName" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                        <Form.Item label="城市" name="city" rules={[{ required: true }]}>
                          <Select
                            mode="tags"
                            maxCount={1}
                            placeholder="选择或输入城市"
                            options={cityOptions.map((item) => ({ value: item, label: item }))}
                            tokenSeparators={[',']}
                          />
                        </Form.Item>
                        <Form.Item label="比赛日期" name="eventDate" rules={[{ required: true }]}>
                          <Input type="date" />
                        </Form.Item>
                        <Form.Item
                          label="距离项目"
                          name="distanceItems"
                          rules={[{ required: true }]}
                        >
                          <Select
                            mode="multiple"
                            placeholder="选择距离项目"
                            options={distanceOptions.map((item) => ({
                              value: item,
                              label: item,
                            }))}
                          />
                        </Form.Item>
                        <Form.Item label="起点" name="startPoint">
                          <Input />
                        </Form.Item>
                        <Form.Item label="终点" name="endPoint">
                          <Input />
                        </Form.Item>
                      </div>
                    </Section>
                    <Section title="报名信息">
                      <div className="form-grid">
                        <Form.Item
                          label="报名状态"
                          name="signupStatus"
                          rules={[{ required: true }]}
                        >
                          <Select options={signupStatusOptions} />
                        </Form.Item>
                        <Form.Item label="报名开始时间" name="signupStartAt">
                          <Input type="datetime-local" />
                        </Form.Item>
                        <Form.Item label="报名截止时间" name="signupDeadline">
                          <Input type="datetime-local" />
                        </Form.Item>
                        <Form.Item label="官方入口" name="officialUrl" rules={[{ required: true }]}>
                          <Input placeholder="https://example.com" />
                        </Form.Item>
                      </div>
                    </Section>
                  </>
                ),
              },
              {
                key: 'judgement',
                label: '跑前判断',
                children: (
                  <Section title="跑前判断">
                    <Form.Item label="跑前判断" name="runJudgement" rules={[{ required: true }]}>
                      <Select options={runJudgementOptions} />
                    </Form.Item>
                    <Form.Item label="一句话判断" name="judgementSummary">
                      <Input />
                    </Form.Item>
                    <Form.Item label="判断理由" name="judgementReasons">
                      <TextArea rows={4} placeholder="每行一条" />
                    </Form.Item>
                    <Form.Item label="适合谁" name="suitableFor">
                      <TextArea rows={3} placeholder="每行一条" />
                    </Form.Item>
                    <Form.Item label="不太适合谁" name="notSuitableFor">
                      <TextArea rows={3} placeholder="每行一条" />
                    </Form.Item>
                  </Section>
                ),
              },
              {
                key: 'checklist',
                label: '报名前确认清单',
                children: <ChecklistEditor />,
              },
              {
                key: 'source',
                label: '来源与发布',
                children: (
                  <>
                    <Section title="标签与体验">
                      <Form.Item label="标签" name="tags">
                        <Input placeholder="新手友好, 适合 PB, 交通方便" />
                      </Form.Item>
                    </Section>
                    <Section title="来源与可信度">
                      <div className="form-grid">
                        <Form.Item label="来源名称" name="sourceName" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                        <Form.Item label="来源链接" name="sourceUrl">
                          <Input />
                        </Form.Item>
                        <Form.Item label="来源等级" name="sourceLevel" rules={[{ required: true }]}>
                          <Select options={sourceLevelOptions} />
                        </Form.Item>
                        <Form.Item label="信息状态" name="infoStatus" rules={[{ required: true }]}>
                          <Select options={infoStatusOptions} />
                        </Form.Item>
                      </div>
                    </Section>
                    <Section title="发布状态">
                      <Form.Item label="发布状态" name="publishStatus" rules={[{ required: true }]}>
                        <Select options={publishStatusOptions} />
                      </Form.Item>
                    </Section>
                    <Descriptions bordered size="small">
                      <Descriptions.Item label="合规提示">
                        <span className="notice-line">AI 整理，仅供参考，报名以官方为准。</span>
                      </Descriptions.Item>
                      <Descriptions.Item label="官方入口文案">前往官方确认</Descriptions.Item>
                    </Descriptions>
                    <Form.Item shouldUpdate noStyle>
                      {() => <MiniappPublishChecks values={form.getFieldsValue(true)} />}
                    </Form.Item>
                  </>
                ),
              },
              ...(id
                ? [
                    {
                      key: 'source-summary',
                      label: '用户端来源摘要',
                      children: <SourceSummaryPanel eventId={id} />,
                    },
                    {
                      key: 'share',
                      label: '分享配置',
                      children: (
                        <Section title="赛事分享覆盖">
                          <Alert
                            type="info"
                            showIcon
                            message="默认继承分享中心的赛事详情模板，重点赛事可单独覆盖标题或图片。"
                          />
                          <Button
                            style={{ marginTop: 16 }}
                            onClick={() => navigate('/share?tab=events')}
                          >
                            前往分享中心管理
                          </Button>
                        </Section>
                      ),
                    },
                    {
                      key: 'logs',
                      label: '操作日志',
                      children: <OperationLogTable logs={logs} />,
                    },
                  ]
                : []),
            ]}
          />
        </Form>
      </Card>
    </main>
  );
}

function SourceSummaryPanel({ eventId }: { eventId: string }) {
  const { can } = useAdmin();
  const [items, setItems] = useState<EventSourceSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<EventSourceSummaryItem | null>(null);
  const [summaryForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const result = await apiGet<{ items: EventSourceSummaryItem[] }>(
        `/api/admin/events/${eventId}/source-summaries`,
      );
      setItems(result.items);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => void load(), [eventId]);

  const generate = async () => {
    try {
      setGenerating(true);
      await apiSend('POST', `/api/admin/events/${eventId}/source-summaries/generate`);
      message.success('来源摘要草稿已生成，请人工核对后发布');
      await load();
    } catch (error) {
      showError(error);
    } finally {
      setGenerating(false);
    }
  };

  const openEdit = (item: EventSourceSummaryItem) => {
    setEditing(item);
    summaryForm.setFieldsValue({
      summary: item.summary,
      keyPoints: item.keyPoints.join('\n'),
      limitations: item.limitations || '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const values = await summaryForm.validateFields();
    await apiSend('PUT', `/api/admin/source-summaries/${editing.id}`, {
      summary: values.summary,
      keyPoints: splitLines(values.keyPoints),
      limitations: values.limitations || null,
      expectedUpdatedAt: editing.updatedAt,
    });
    message.success('摘要草稿已保存');
    setEditing(null);
    await load();
  };

  const publish = (item: EventSourceSummaryItem) => {
    let note = '';
    Modal.confirm({
      title: '发布用户端来源摘要',
      width: 620,
      okText: '确认发布',
      cancelText: '取消',
      content: (
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 12 }}>
          <Alert
            type="warning"
            showIcon
            message="发布后将取代当前公开版本；AI 内容必须已经人工核对。"
          />
          <Input.TextArea
            rows={3}
            maxLength={500}
            placeholder="填写 4-500 字发布备注"
            onChange={(event) => {
              note = event.target.value;
            }}
          />
        </Space>
      ),
      onOk: async () => {
        if (note.trim().length < 4) {
          message.warning('请填写至少 4 个字的发布备注');
          throw new Error('发布备注不足');
        }
        await apiSend('POST', `/api/admin/source-summaries/${item.id}/publish`, {
          expectedUpdatedAt: item.updatedAt,
          note: note.trim(),
        });
        message.success('来源摘要已发布');
        await load();
      },
    });
  };

  return (
    <Section title="用户端来源摘要">
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="AI 只生成草稿。页面正文不会保存，发布前必须人工核对来源摘要。"
        />
        {can('edit_event') && (
          <div>
            <Button type="primary" icon={<RobotOutlined />} loading={generating} onClick={generate}>
              抓取并生成草稿
            </Button>
          </div>
        )}
        <Table<EventSourceSummaryItem>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={items}
          pagination={false}
          scroll={{ x: 1080 }}
          columns={[
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (value, record) => (
                <Space direction="vertical" size={2}>
                  <Tag
                    color={value === 'published' ? 'green' : value === 'draft' ? 'blue' : undefined}
                  >
                    {value === 'published' ? '已发布' : value === 'draft' ? '草稿' : '已取代'}
                  </Tag>
                  {record.staleAt && <Tag color="orange">待复核</Tag>}
                </Space>
              ),
            },
            {
              title: '摘要',
              dataIndex: 'summary',
              width: 340,
              render: (value: string) => (
                <Typography.Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0 }}>
                  {value}
                </Typography.Paragraph>
              ),
            },
            {
              title: '依据',
              dataIndex: 'basis',
              width: 150,
              render: (value) => (value === 'page_text' ? '页面正文' : '已保存来源记录'),
            },
            { title: '模型', dataIndex: 'aiModel', width: 150 },
            {
              title: '抓取时间',
              dataIndex: 'fetchedAt',
              width: 150,
              render: (value) => dayjs(value).format('MM-DD HH:mm'),
            },
            {
              title: '操作',
              width: 180,
              fixed: 'right',
              render: (_, record) =>
                can('edit_event') && record.status === 'draft' ? (
                  <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                      编辑
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      icon={<FileDoneOutlined />}
                      onClick={() => publish(record)}
                    >
                      发布
                    </Button>
                  </Space>
                ) : null,
            },
          ]}
        />
      </Space>
      <Modal
        title="编辑来源摘要草稿"
        open={Boolean(editing)}
        width={720}
        okText="保存草稿"
        cancelText="取消"
        onCancel={() => setEditing(null)}
        onOk={() => void saveEdit().catch(showError)}
      >
        <Form form={summaryForm} layout="vertical">
          <Form.Item label="摘要" name="summary" rules={[{ required: true, min: 80, max: 400 }]}>
            <Input.TextArea rows={6} showCount maxLength={400} />
          </Form.Item>
          <Form.Item label="关键点" name="keyPoints" rules={[{ required: true }]}>
            <Input.TextArea rows={5} placeholder="每行一条，共 2-6 条" />
          </Form.Item>
          <Form.Item label="限制说明" name="limitations">
            <Input.TextArea rows={3} showCount maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </Section>
  );
}

function ChecklistEditor() {
  return (
    <Section title="报名前确认清单">
      <Form.List name="checklistItems">
        {(fields, { add, remove }) => (
          <Space direction="vertical" style={{ width: '100%' }}>
            {fields.map((field) => (
              <div className="checklist-row" key={field.key}>
                <Form.Item
                  {...field}
                  label="分组"
                  name={[field.name, 'groupName']}
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  {...field}
                  label="确认项"
                  name={[field.name, 'itemName']}
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  {...field}
                  label="状态"
                  name={[field.name, 'itemStatus']}
                  rules={[{ required: true }]}
                >
                  <Select options={infoStatusOptions} />
                </Form.Item>
                <Form.Item {...field} label="说明" name={[field.name, 'description']}>
                  <Input />
                </Form.Item>
                <Form.Item {...field} label="排序" name={[field.name, 'sortOrder']}>
                  <InputNumber min={0} />
                </Form.Item>
                <Button danger onClick={() => remove(field.name)}>
                  删除
                </Button>
              </div>
            ))}
            <Button
              icon={<PlusOutlined />}
              onClick={() => add({ itemStatus: 'pending_verify', sortOrder: fields.length + 1 })}
            >
              新增确认项
            </Button>
          </Space>
        )}
      </Form.List>
    </Section>
  );
}
