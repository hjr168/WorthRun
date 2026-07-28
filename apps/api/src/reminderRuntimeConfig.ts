import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const reminderRuntimeKeys = [
  'REMINDER_FEATURE_ENABLED',
  'WX_MINIPROGRAM_STATE',
  'WX_SIGNUP_REMINDER_TEMPLATE_ID',
  'WX_SIGNUP_REMINDER_EVENT_FIELD',
  'WX_SIGNUP_REMINDER_DATE_FIELD',
  'WX_SIGNUP_REMINDER_NOTICE_FIELD',
  'WX_RACE_REMINDER_TEMPLATE_ID',
  'WX_RACE_REMINDER_EVENT_FIELD',
  'WX_RACE_REMINDER_DATE_FIELD',
  'WX_RACE_REMINDER_NOTICE_FIELD',
  'UNICLOUD_SPACE_EXPIRES_AT',
] as const;

function normalized(value: string | undefined) {
  return value?.trim() || '';
}

export function readRuntimeEnvFile(path = resolve(process.cwd(), '.env')) {
  try {
    return parseEnv(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function reminderRuntimeConfigMatched(
  runtimeEnv: NodeJS.ProcessEnv = process.env,
  fileEnv: Record<string, string | undefined> | null = readRuntimeEnvFile(),
) {
  if (!fileEnv) return false;
  return reminderRuntimeKeys.every(
    (key) => normalized(runtimeEnv[key]) === normalized(fileEnv[key]),
  );
}

export function cloudDaysRemaining(
  value: string | undefined = process.env.UNICLOUD_SPACE_EXPIRES_AT,
  now = new Date(),
) {
  const expiresAt = Date.parse(value || '');
  if (!Number.isFinite(expiresAt)) return null;
  return Math.floor((expiresAt - now.getTime()) / (24 * 60 * 60 * 1000));
}
