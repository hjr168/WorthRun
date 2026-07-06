import { Alert, Card, Modal, Space, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { apiGet } from '../api';
import { AdminEvent, OperationLog } from '../types';
import { showError } from '../utils/helpers';
import { buildMiniappPublishChecks } from '../utils/form';
import { OperationLogTable } from './OperationLogTable';

export function MiniappPublishChecks({ values }: { values: Record<string, unknown> }) {
  const { checks, canPublish } = buildMiniappPublishChecks(values);

  return (
    <Card size="small" className="miniapp-check-card" title="小程序发布前检查">
      <Space direction="vertical" size={8}>
        <Alert
          type="info"
          showIcon
          message="仅作为人工运营发布前提示，不替代后端发布校验，不会自动发布。"
        />
        <Space wrap>
          {checks.map((item) => (
            <Tag key={item.label} color={item.ok ? 'green' : 'orange'}>
              {item.label}：{item.ok ? '已具备' : '待补充/需复核'}
            </Tag>
          ))}
          <Tag color={canPublish ? 'green' : 'red'}>
            当前是否可发布：{canPublish ? '可以' : '不建议'}
          </Tag>
        </Space>
      </Space>
    </Card>
  );
}

export function EventLogsModal({ event, onClose }: { event: AdminEvent | null; onClose: () => void }) {
  const [logs, setLogs] = useState<OperationLog[]>([]);

  useEffect(() => {
    if (!event) return;
    apiGet<{ items: OperationLog[] }>(
      `/api/admin/operation-logs?targetType=events&targetId=${event.id}`,
    )
      .then((result) => setLogs(result.items))
      .catch(showError);
  }, [event]);

  return (
    <Modal
      title={event ? `${event.eventName} 操作日志` : '操作日志'}
      open={!!event}
      onCancel={onClose}
      footer={null}
      width={860}
    >
      <OperationLogTable logs={logs} />
    </Modal>
  );
}
