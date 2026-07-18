import type {
  EventChangeAlertQuery,
  EventChangeAlertStatus,
  EventChangeField,
  EventChangeSeverity,
} from '../types';

const fieldLabels: Record<EventChangeField, string> = {
  eventDate: '比赛日期',
  distanceItems: '距离项目',
  signupStatus: '报名状态',
  signupDeadline: '报名截止时间',
  officialUrl: '官方入口',
  cancellationSignal: '取消信号',
  postponementSignal: '延期信号',
};

const statusLabels: Record<EventChangeAlertStatus, string> = {
  open: '待复核',
  applied: '已应用',
  dismissed: '已忽略',
  archived_event: '赛事已归档',
  superseded: '已取代',
};

const severityLabels: Record<EventChangeSeverity, string> = {
  normal: '一般',
  important: '重要',
  critical: '严重',
};

export function eventChangeFieldLabel(field: EventChangeField) {
  return fieldLabels[field];
}

export function eventChangeStatusLabel(status: EventChangeAlertStatus) {
  return statusLabels[status];
}

export function eventChangeSeverityLabel(severity: EventChangeSeverity) {
  return severityLabels[severity];
}

export function buildEventChangeQuery(query: EventChangeAlertQuery) {
  const params = new URLSearchParams();
  params.set('page', String(Math.max(1, Math.floor(query.page || 1))));
  params.set('pageSize', String(Math.min(50, Math.max(1, Math.floor(query.pageSize || 20)))));
  if (query.status) params.set('status', query.status);
  if (query.severity) params.set('severity', query.severity);
  if (query.changedField) params.set('changedField', query.changedField);
  if (query.search?.trim()) params.set('search', query.search.trim());
  return params.toString();
}
