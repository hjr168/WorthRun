import {
  infoStatusLabels,
  publishStatusLabels,
  runJudgementLabels,
  signupStatusLabels,
} from '@worth-running/shared';

export const publishStatusOptions = Object.entries(publishStatusLabels).map(([value, label]) => ({
  value,
  label,
}));
export const infoStatusOptions = Object.entries(infoStatusLabels).map(([value, label]) => ({
  value,
  label,
}));
export const signupStatusOptions = Object.entries(signupStatusLabels).map(([value, label]) => ({
  value,
  label,
}));
export const runJudgementOptions = Object.entries(runJudgementLabels).map(([value, label]) => ({
  value,
  label,
}));
export const sourceLevelOptions = [
  { value: 'official', label: '官方来源' },
  { value: 'trusted', label: '可信来源' },
  { value: 'secondary', label: '二级来源' },
  { value: 'unknown', label: '待核实' },
];
export const feedbackStatusOptions = [
  { value: 'pending', label: '待处理' },
  { value: 'handling', label: '处理中' },
  { value: 'resolved', label: '已处理' },
  { value: 'rejected', label: '已驳回' },
];
export const riskKeywords = ['取消', '延期', '疑似', '网传', '非官方'];
