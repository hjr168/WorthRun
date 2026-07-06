import { Card, Table } from 'antd';
import dayjs from 'dayjs';
import { OperationLog } from '../types';

export function OperationLogTable({ logs }: { logs: OperationLog[] }) {
  return (
    <Card title="操作记录">
      <Table
        rowKey="id"
        dataSource={logs}
        pagination={false}
        columns={[
          { title: '操作', dataIndex: 'action' },
          { title: '对象', dataIndex: 'targetType' },
          { title: '对象 ID', dataIndex: 'targetId' },
          { title: '备注', dataIndex: 'note' },
          {
            title: '时间',
            dataIndex: 'createdAt',
            render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm'),
          },
        ]}
      />
    </Card>
  );
}
