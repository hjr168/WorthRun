import { Button, Input, Modal, Select, Space, Table, message } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../api';
import { FeedbackItem } from '../types';
import { feedbackStatusOptions } from '../constants';
import { showError } from '../utils/helpers';
import { useAdmin } from '../context/AdminContext';

export function QualityPage() {
  const navigate = useNavigate();
  const { can } = useAdmin();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [status, setStatus] = useState<string>();

  const load = () => {
    apiGet<{ items: FeedbackItem[] }>(`/api/admin/feedback${status ? `?status=${status}` : ''}`)
      .then((result) => setItems(result.items))
      .catch(showError);
  };

  useEffect(load, [status]);

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
        load();
      },
    });
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">质量与反馈</h1>
          <div className="page-subtitle">处理用户纠错反馈，关键处理动作会写入操作日志</div>
        </div>
        <Select
          allowClear
          placeholder="反馈状态"
          style={{ width: 180 }}
          options={feedbackStatusOptions}
          onChange={setStatus}
        />
      </div>
      <Table
        rowKey="id"
        dataSource={items}
        columns={[
          { title: '反馈类型', dataIndex: 'feedbackType', width: 130 },
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
          { title: '反馈内容', dataIndex: 'content' },
          { title: '处理备注', dataIndex: 'adminNote' },
          {
            title: '提交时间',
            dataIndex: 'createdAt',
            width: 150,
            render: (value) => dayjs(value).format('MM-DD HH:mm'),
          },
          {
            title: '操作',
            width: 180,
            render: (_, record) =>
              can('handle_feedback') ? (
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
