import { runJudgementLabels } from '@worth-running/shared';
import { riskKeywords } from '../constants';

export function defaultChecklist() {
  return [
    ['报名信息', '报名截止', 'pending_verify'],
    ['报名信息', '是否抽签', 'pending_verify'],
    ['赛事规则', '关门时间', 'pending_verify'],
    ['赛事服务', '领物时间', 'pending_verify'],
    ['路线信息', '官方路线', 'pending_verify'],
    ['风险提示', '天气变化', 'pending_verify'],
    ['风险提示', '赛事变更公告', 'pending_verify'],
  ].map(([groupName, itemName, itemStatus], index) => ({
    groupName,
    itemName,
    itemStatus,
    sortOrder: index + 1,
  }));
}

export function splitComma(value?: string) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitLines(value?: string) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toTextList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface PublishCheckItem {
  label: string;
  ok: boolean;
}

export interface PublishCheckSummary {
  officialUrl: string;
  sourceName: string;
  runJudgement: string;
  judgementReasons: string;
  checklistCount: number;
  riskKeywords: string;
}

export interface MiniappPublishChecksResult {
  checks: PublishCheckItem[];
  canPublish: boolean;
  summary: PublishCheckSummary;
}

export function buildMiniappPublishChecks(values: Record<string, unknown>): MiniappPublishChecksResult {
  const judgementReasons = toTextList(values.judgementReasons);
  const checklistItems = Array.isArray(values.checklistItems) ? values.checklistItems : [];
  const textForRiskCheck = [
    values.eventName,
    values.officialUrl,
    values.sourceName,
    values.sourceUrl,
    values.judgementSummary,
    judgementReasons.join(' '),
    toTextList(values.tags).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
  const matchedRiskKeywords = riskKeywords.filter((keyword) => textForRiskCheck.includes(keyword));
  const checks: PublishCheckItem[] = [
    { label: '官方入口', ok: Boolean(values.officialUrl) },
    { label: '来源名称', ok: Boolean(values.sourceName) },
    { label: '跑前判断', ok: Boolean(values.runJudgement) },
    { label: '至少 1 条判断理由', ok: judgementReasons.length > 0 },
    { label: '确认清单', ok: checklistItems.length > 0 },
    { label: '合规提示', ok: true },
    {
      label: matchedRiskKeywords.length ? `风险词：${matchedRiskKeywords.join('、')}` : '风险词',
      ok: matchedRiskKeywords.length === 0,
    },
  ];
  const canPublish = checks.every((item) => item.ok);
  const runJudgement =
    typeof values.runJudgement === 'string' && values.runJudgement in runJudgementLabels
      ? runJudgementLabels[values.runJudgement as keyof typeof runJudgementLabels]
      : '待补充';
  const summary: PublishCheckSummary = {
    officialUrl: typeof values.officialUrl === 'string' ? values.officialUrl : '',
    sourceName: typeof values.sourceName === 'string' ? values.sourceName : '',
    runJudgement,
    judgementReasons: judgementReasons.join('；'),
    checklistCount: checklistItems.length,
    riskKeywords: matchedRiskKeywords.join('、'),
  };

  return { checks, canPublish, summary };
}
