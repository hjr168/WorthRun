import { Alert, Button, Card, Modal, Segmented, Space, Statistic, Typography, message } from 'antd';
import { PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiSend } from '../api';
import {
  DataCleanupAction,
  DataCleanupResult,
  DataQualitySummary,
  InteractionStats,
  OperationLog,
  WorkflowStats,
} from '../types';
import { showError } from '../utils/helpers';
import { OperationLogTable } from '../components/OperationLogTable';
import { useAdmin } from '../context/AdminContext';

const cleanupActions: DataCleanupAction[] = [
  'reject_expired_candidates',
  'reject_outside_region_candidates',
  'archive_expired_events',
  'archive_outside_region_events',
  'reject_invalid_feedback',
  'reject_suspicious_feedback',
  'reject_low_information_feedback',
  'reject_unpublished_event_feedback',
  'reject_duplicate_feedback',
];

const cleanupActionLabels: Record<DataCleanupAction, string> = {
  reject_expired_candidates: '驳回过期候选',
  reject_outside_region_candidates: '驳回区域外候选',
  archive_expired_events: '归档过期赛事',
  archive_outside_region_events: '归档区域外赛事',
  reject_invalid_feedback: '驳回非法反馈',
  reject_suspicious_feedback: '驳回异常探测反馈',
  reject_low_information_feedback: '驳回低信息反馈',
  reject_unpublished_event_feedback: '驳回非公开赛事反馈',
  reject_duplicate_feedback: '驳回重复反馈',
};

export function WorkbenchPage() {
  const { admin } = useAdmin();
  const [data, setData] = useState<{
    totalEvents: number;
    publishedEvents: number;
    pendingVerifyEvents: number;
    pendingFeedback: number;
    recentLogs: OperationLog[];
  }>();
  const [quality, setQuality] = useState<DataQualitySummary>();
  const [workflow, setWorkflow] = useState<WorkflowStats>();
  const [metricDays, setMetricDays] = useState<7 | 30>(30);
  const [metrics, setMetrics] = useState<InteractionStats>();
  const [cleaning, setCleaning] = useState(false);

  const load = () =>
    Promise.all([
      apiGet<typeof data>('/api/admin/dashboard').then(setData),
      apiGet<DataQualitySummary>('/api/admin/data-quality/summary').then(setQuality),
      apiGet<WorkflowStats>('/api/admin/workflow-stats').then(setWorkflow),
    ]).catch(showError);

  useEffect(() => void load(), []);
  useEffect(() => {
    apiGet<InteractionStats>(`/api/admin/interaction-stats?days=${metricDays}`)
      .then(setMetrics)
      .catch(showError);
  }, [metricDays]);

  const previewCleanup = async () => {
    try {
      setCleaning(true);
      const preview = await apiSend<DataCleanupResult>('POST', '/api/admin/data-quality/cleanup', {
        actions: cleanupActions,
        dryRun: true,
      });
      Modal.confirm({
        title: '确认应用数据治理？',
        width: 620,
        content: (
          <Space direction="vertical" size={4} style={{ marginTop: 12 }}>
            {cleanupActions.map((action) => (
              <span key={action}>
                {cleanupActionLabels[action]}：{preview.counts[action] || 0} 条
              </span>
            ))}
            <span>所有记录仅修改状态并保留操作日志，不会物理删除。</span>
          </Space>
        ),
        okText: '按预览数量应用',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          await apiSend('POST', '/api/admin/data-quality/cleanup', {
            actions: cleanupActions,
            dryRun: false,
            expected: preview.counts,
          });
          message.success('数据治理已完成');
          await load();
        },
      });
    } catch (error) {
      showError(error);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">工作台</h1>
          <div className="page-subtitle">手动维护赛事、反馈与关键操作记录</div>
        </div>
        <Link to="/events/edit">
          <Button type="primary" icon={<PlusOutlined />}>
            新增赛事
          </Button>
        </Link>
      </div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="AI 整理，仅供参考，报名以官方为准。官方入口统一使用“前往官方确认”。"
        />
        <div className="stat-grid">
          <Card>
            <Statistic title="当前赛事总数" value={data?.totalEvents ?? 0} />
          </Card>
          <Card>
            <Statistic title="已发布赛事数" value={data?.publishedEvents ?? 0} />
          </Card>
          <Card>
            <Statistic title="待核实赛事数" value={data?.pendingVerifyEvents ?? 0} />
          </Card>
          <Card>
            <Statistic title="待处理反馈数" value={data?.pendingFeedback ?? 0} />
          </Card>
        </div>
        <section className="form-section">
          <div className="section-heading">
            <h2>发布工作流</h2>
            <Link to="/ai-sources">
              <Button>处理候选赛事</Button>
            </Link>
          </div>
          <div className="stat-grid">
            <Card>
              <Statistic title="候选重复组" value={workflow?.duplicateGroups ?? 0} />
            </Card>
            <Card>
              <Statistic title="可采纳候选" value={workflow?.readyCandidates ?? 0} />
            </Card>
            <Card>
              <Statistic title="可发布草稿" value={workflow?.publishableDrafts ?? 0} />
            </Card>
            <Card>
              <Statistic title="缺少官方依据" value={workflow?.missingOfficialEvidence ?? 0} />
            </Card>
          </div>
        </section>
        <section className="form-section">
          <div className="section-heading">
            <h2>数据质量</h2>
            {admin?.role === 'super_admin' && (
              <Button
                danger
                icon={<SafetyCertificateOutlined />}
                loading={cleaning}
                onClick={previewCleanup}
              >
                预览数据治理
              </Button>
            )}
          </div>
          <div className="stat-grid">
            <Card>
              <Statistic
                title="未来大湾区已发布"
                value={quality?.futureGreaterBayAreaPublished ?? 0}
              />
            </Card>
            <Card>
              <Statistic
                title="待驳回候选"
                value={
                  (quality?.reject_expired_candidates || 0) +
                  (quality?.reject_outside_region_candidates || 0)
                }
              />
            </Card>
            <Card>
              <Statistic
                title="待归档赛事"
                value={
                  (quality?.archive_expired_events || 0) +
                  (quality?.archive_outside_region_events || 0)
                }
              />
            </Card>
            <Card>
              <Statistic
                title="异常或重复反馈"
                value={
                  (quality?.reject_invalid_feedback || 0) +
                  (quality?.reject_duplicate_feedback || 0)
                }
              />
            </Card>
          </div>
        </section>
        <section className="form-section">
          <div className="section-heading">
            <h2>运营指标</h2>
            <Segmented
              value={metricDays}
              options={[
                { label: '近 7 天', value: 7 },
                { label: '近 30 天', value: 30 },
              ]}
              onChange={(value) => setMetricDays(value as 7 | 30)}
            />
          </div>
          <div className="stat-grid">
            <Card>
              <Statistic title="详情用户" value={metrics?.detailUsers ?? 0} />
              <Typography.Text type="secondary">
                详情访问 {metrics?.detailViews ?? 0} 次
              </Typography.Text>
            </Card>
            <Card>
              <Statistic title="官方入口复制" value={metrics?.officialClicks ?? 0} />
              <Typography.Text type="secondary">
                转化率 {metrics?.officialClickRate ?? 0}%
              </Typography.Text>
            </Card>
            <Card>
              <Statistic title="新增收藏" value={metrics?.favoriteAdds ?? 0} />
              <Typography.Text type="secondary">
                转化率 {metrics?.favoriteRate ?? 0}%
              </Typography.Text>
            </Card>
            <Card>
              <Statistic title="分享记录" value={metrics?.shares ?? 0} />
              <Typography.Text type="secondary">转化率 {metrics?.shareRate ?? 0}%</Typography.Text>
            </Card>
            <Card>
              <Statistic title="偏好用户" value={metrics?.preferenceUsers ?? 0} />
            </Card>
          </div>
        </section>
        <OperationLogTable logs={data?.recentLogs || []} />
      </Space>
    </main>
  );
}
