import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tabs,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiSend } from '../api';
import { AdminEvent, OperationLog } from '../types';
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
    const values = await form.validateFields();
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
