export const complianceNotice = 'AI 整理，仅供参考，报名以官方为准。';
export const officialActionText = '前往官方确认';

export const signupStatusLabels: Record<string, string> = {
  signup_open: '报名中',
  closing_soon: '即将截止',
  closed: '已截止',
  not_started: '未开始',
  unknown: '待核实',
};

export const runJudgementLabels: Record<string, string> = {
  priority: '适合优先关注',
  watch: '可以观望',
  unverified: '信息待核实',
};

export const infoStatusLabels: Record<string, string> = {
  ai_generated: 'AI 整理',
  pending_verify: '待核实',
  verified: '已识别',
  user_flagged: '用户反馈异常',
  source_error: '来源异常',
};

export function formatDate(value?: string) {
  if (!value) return '待确认';
  return value.slice(0, 10);
}

export function formatDateTime(value?: string) {
  if (!value) return '待确认';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '待确认';
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDistance(items?: string[]) {
  return items && items.length > 0 ? items.join(' / ') : '距离待确认';
}

export function labelOf(labels: Record<string, string>, value?: string) {
  return value ? labels[value] || value : '待确认';
}
