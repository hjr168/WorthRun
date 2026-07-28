import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@worth-running/database';
import {
  cloudDaysRemaining,
  readRuntimeEnvFile,
  reminderRuntimeConfigMatched,
} from './reminderRuntimeConfig.js';

export type PreflightPhase = 'foundation' | 'users' | 'reminders';
export type PreflightMode = 'ready' | 'live';
export type PreflightStatus = 'pass' | 'warning' | 'blocker';

export interface PreflightCheck {
  id: string;
  status: PreflightStatus;
  message: string;
}

interface WechatTemplate {
  priTmplId?: string;
  content?: string;
}

function check(id: string, passed: boolean, message: string): PreflightCheck {
  return { id, status: passed ? 'pass' : 'blocker', message };
}

function secretLength(value: string | undefined) {
  return value?.trim().length ?? 0;
}

function isTemplateField(value: string | undefined) {
  return /^(thing|date|time|phrase|character_string|number)\d+$/.test(value?.trim() || '');
}

export function evaluateV053Environment(
  env: NodeJS.ProcessEnv,
  phase: PreflightPhase,
  mode: PreflightMode = 'live',
): PreflightCheck[] {
  const checks: PreflightCheck[] = [];
  const usersRequired = phase === 'users' || phase === 'reminders';
  const remindersRequired = phase === 'reminders';
  const userTokenSecret = env.USER_TOKEN_SECRET?.trim();
  const userHashSecret = env.USER_OPENID_HASH_SECRET?.trim();

  checks.push(
    check('node_env', env.NODE_ENV === 'production', 'NODE_ENV 必须为 production'),
    check(
      'release',
      Boolean(env.APP_RELEASE?.trim() && !['dev', 'unknown'].includes(env.APP_RELEASE.trim())),
      'APP_RELEASE 必须填写实际版本或提交号',
    ),
  );

  if (usersRequired) {
    checks.push(
      check(
        'user_feature',
        env.USER_SYSTEM_ENABLED === 'true',
        '用户灰度阶段必须开启 USER_SYSTEM_ENABLED=true',
      ),
      check('wx_appid', Boolean(env.WX_APPID?.trim()), '必须配置 WX_APPID'),
      check('wx_secret', secretLength(env.WX_APPSECRET) >= 16, '必须配置 WX_APPSECRET'),
      check(
        'user_token_secret',
        secretLength(userTokenSecret) >= 32,
        'USER_TOKEN_SECRET 至少 32 个字符',
      ),
      check(
        'user_hash_secret',
        secretLength(userHashSecret) >= 32,
        'USER_OPENID_HASH_SECRET 至少 32 个字符',
      ),
      check(
        'separate_user_secrets',
        Boolean(userTokenSecret && userHashSecret && userTokenSecret !== userHashSecret),
        '用户令牌与 OpenID HMAC 必须使用不同密钥',
      ),
      check(
        'openid_encryption_key',
        Buffer.from(env.USER_OPENID_ENCRYPTION_KEY || '', 'base64').length === 32,
        'USER_OPENID_ENCRYPTION_KEY 必须是 32 字节 Base64',
      ),
      check(
        'avatar_url',
        /^https:\/\//.test(env.UNICLOUD_AVATAR_BASE_URL?.trim() || ''),
        'UNICLOUD_AVATAR_BASE_URL 必须是 HTTPS URL',
      ),
      check(
        'avatar_space_url',
        Boolean(
          env.UNICLOUD_SPACE_ID &&
          env.UNICLOUD_AVATAR_BASE_URL?.trim().startsWith(
            `https://${env.UNICLOUD_SPACE_ID}.dev-hz.cloudbasefunction.cn/worthrun-avatar`,
          ),
        ),
        '头像 URL 必须指向当前支付宝云空间的 /worthrun-avatar',
      ),
      check(
        'avatar_secret',
        secretLength(env.UNICLOUD_AVATAR_SHARED_SECRET) >= 32,
        'UNICLOUD_AVATAR_SHARED_SECRET 至少 32 个字符',
      ),
      check(
        'unicloud_provider',
        env.UNICLOUD_PROVIDER === 'alipay',
        '当前头像空间必须配置 UNICLOUD_PROVIDER=alipay',
      ),
      check(
        'unicloud_space',
        /^env-[a-z0-9]+$/.test(env.UNICLOUD_SPACE_ID?.trim() || ''),
        '必须配置支付宝云服务空间 ID',
      ),
      check(
        'unicloud_expiry',
        Number.isFinite(Date.parse(env.UNICLOUD_SPACE_EXPIRES_AT || '')) &&
          Date.parse(env.UNICLOUD_SPACE_EXPIRES_AT || '') > Date.now() + 30 * 24 * 60 * 60 * 1000,
        '支付宝云空间有效期必须晚于当前时间至少 30 天',
      ),
    );
  }

  if (remindersRequired) {
    checks.push(
      check(
        'reminder_feature',
        mode === 'ready' || env.REMINDER_FEATURE_ENABLED === 'true',
        '正式启用阶段必须开启 REMINDER_FEATURE_ENABLED=true',
      ),
      check(
        'miniprogram_state',
        env.WX_MINIPROGRAM_STATE === (mode === 'ready' ? 'trial' : 'formal'),
        mode === 'ready'
          ? '体验验收必须设置 WX_MINIPROGRAM_STATE=trial'
          : '正式启用必须设置 WX_MINIPROGRAM_STATE=formal',
      ),
      check(
        'signup_template',
        Boolean(env.WX_SIGNUP_REMINDER_TEMPLATE_ID?.trim()),
        '必须配置报名提醒模板 ID',
      ),
      check(
        'race_template',
        Boolean(env.WX_RACE_REMINDER_TEMPLATE_ID?.trim()),
        '必须配置赛前提醒模板 ID',
      ),
      check(
        'separate_templates',
        Boolean(
          env.WX_SIGNUP_REMINDER_TEMPLATE_ID?.trim() &&
          env.WX_RACE_REMINDER_TEMPLATE_ID?.trim() &&
          env.WX_SIGNUP_REMINDER_TEMPLATE_ID !== env.WX_RACE_REMINDER_TEMPLATE_ID,
        ),
        '报名提醒与赛前提醒必须使用不同模板',
      ),
      check(
        'signup_template_fields',
        [
          env.WX_SIGNUP_REMINDER_EVENT_FIELD,
          env.WX_SIGNUP_REMINDER_NOTICE_FIELD,
          env.WX_SIGNUP_REMINDER_DATE_FIELD,
        ].every(isTemplateField),
        '必须按微信模板配置报名提醒的赛事、提示和日期字段键',
      ),
      check(
        'race_template_fields',
        [
          env.WX_RACE_REMINDER_EVENT_FIELD,
          env.WX_RACE_REMINDER_NOTICE_FIELD,
          env.WX_RACE_REMINDER_DATE_FIELD,
        ].every(isTemplateField),
        '必须按微信模板配置赛前提醒的赛事、提示和日期字段键',
      ),
    );
  }
  return checks;
}

export function evaluateReminderRuntimeConfig(
  env: NodeJS.ProcessEnv,
  fileEnv: Record<string, string | undefined> | null = readRuntimeEnvFile(),
): PreflightCheck[] {
  return [
    check(
      'runtime_config_match',
      reminderRuntimeConfigMatched(env, fileEnv),
      '当前进程的提醒配置必须与服务器 .env 一致',
    ),
    check(
      'unicloud_remaining_days',
      (cloudDaysRemaining(env.UNICLOUD_SPACE_EXPIRES_AT) ?? -1) >= 30,
      'UniCloud 空间有效期必须至少剩余 30 天',
    ),
  ];
}

function fileText(repoRoot: string, path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function configValue(text: string, key: string) {
  return text.match(new RegExp(`${key}:\\s*['\"]([^'\"]*)['\"]`))?.[1] ?? '';
}

export function evaluateV053Repository(input: {
  repoRoot: string;
  env: NodeJS.ProcessEnv;
  phase: PreflightPhase;
}): PreflightCheck[] {
  const checks: PreflightCheck[] = [];
  const prodConfig = fileText(input.repoRoot, 'apps/miniapp/config/prod.ts');
  const projectConfig = JSON.parse(
    fileText(input.repoRoot, 'apps/miniapp/project.config.json'),
  ) as { setting?: { urlCheck?: boolean } };
  const privacy = fileText(input.repoRoot, 'docs/PRIVACY_POLICY_DRAFT.md');
  const cloudFunction = fileText(
    input.repoRoot,
    'uniCloud-alipay/cloudfunctions/worthrun-avatar/index.js',
  );
  const cloudFunctionPackage = JSON.parse(
    fileText(input.repoRoot, 'uniCloud-alipay/cloudfunctions/worthrun-avatar/package.json'),
  ) as { 'cloudfunction-config'?: { runtime?: string; path?: string } };
  const apiBaseUrl = configValue(prodConfig, 'apiBaseUrl');

  checks.push(
    check(
      'prod_api_url',
      /^https:\/\//.test(apiBaseUrl) && !apiBaseUrl.includes('localhost'),
      '小程序正式配置必须使用非 localhost 的 HTTPS API',
    ),
    check(
      'url_check',
      projectConfig.setting?.urlCheck === true,
      'project.config.json 必须开启 urlCheck',
    ),
    check(
      'unicloud_function',
      cloudFunction.includes('mpserverlessComposedResponse') &&
        cloudFunction.includes('cloudPathAsRealPath: true') &&
        [undefined, 'Nodejs18'].includes(cloudFunctionPackage['cloudfunction-config']?.runtime) &&
        cloudFunctionPackage['cloudfunction-config']?.path === '/worthrun-avatar',
      'UniCloud 支付宝云函数必须使用集成响应、真实路径、默认 Nodejs18 和固定 URL 路径',
    ),
  );

  if (input.phase !== 'foundation') {
    checks.push(
      check('privacy_contacts', !privacy.includes('待补充'), '隐私政策仍有“待补充”主体或联系方式'),
    );
  }

  if (input.phase === 'reminders') {
    checks.push(
      check(
        'miniapp_signup_template',
        configValue(prodConfig, 'signup') === input.env.WX_SIGNUP_REMINDER_TEMPLATE_ID?.trim(),
        'prod.ts 的报名模板 ID 必须与服务端一致',
      ),
      check(
        'miniapp_race_template',
        configValue(prodConfig, 'race_week') === input.env.WX_RACE_REMINDER_TEMPLATE_ID?.trim(),
        'prod.ts 的赛前模板 ID 必须与服务端一致',
      ),
    );
  }
  return checks;
}

export function evaluateV053WechatTemplates(
  env: NodeJS.ProcessEnv,
  templates: WechatTemplate[],
): PreflightCheck[] {
  const signupId = env.WX_SIGNUP_REMINDER_TEMPLATE_ID?.trim() || '';
  const raceId = env.WX_RACE_REMINDER_TEMPLATE_ID?.trim() || '';
  const signup = templates.find((item) => item.priTmplId === signupId);
  const race = templates.find((item) => item.priTmplId === raceId);
  const hasFields = (template: WechatTemplate | undefined, fields: Array<string | undefined>) =>
    Boolean(
      template &&
      fields.every(
        (field) => field?.trim() && template.content?.includes(`{{${field.trim()}.DATA}}`),
      ),
    );

  return [
    check('wechat_signup_template', Boolean(signup), '报名提醒模板必须存在于当前微信小程序'),
    check('wechat_race_template', Boolean(race), '赛前提醒模板必须存在于当前微信小程序'),
    check(
      'wechat_signup_fields',
      hasFields(signup, [
        env.WX_SIGNUP_REMINDER_EVENT_FIELD,
        env.WX_SIGNUP_REMINDER_DATE_FIELD,
        env.WX_SIGNUP_REMINDER_NOTICE_FIELD,
      ]),
      '微信报名提醒模板字段必须与服务端配置一致',
    ),
    check(
      'wechat_race_fields',
      hasFields(race, [
        env.WX_RACE_REMINDER_EVENT_FIELD,
        env.WX_RACE_REMINDER_DATE_FIELD,
        env.WX_RACE_REMINDER_NOTICE_FIELD,
      ]),
      '微信赛前提醒模板字段必须与服务端配置一致',
    ),
  ];
}

export async function fetchV053WechatTemplates(env: NodeJS.ProcessEnv): Promise<WechatTemplate[]> {
  const appid = env.WX_APPID?.trim();
  const secret = env.WX_APPSECRET?.trim();
  if (!appid || !secret) throw new Error('微信 AppID 或 AppSecret 未配置');
  const tokenResponse = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`,
  );
  const tokenResult = (await tokenResponse.json()) as {
    access_token?: string;
    errcode?: number;
  };
  if (!tokenResult.access_token)
    throw new Error(`微信 access token 获取失败 ${tokenResult.errcode ?? ''}`);
  const templateResponse = await fetch(
    `https://api.weixin.qq.com/wxaapi/newtmpl/gettemplate?access_token=${encodeURIComponent(tokenResult.access_token)}`,
  );
  const templateResult = (await templateResponse.json()) as {
    data?: WechatTemplate[];
    errcode?: number;
  };
  if (templateResult.errcode !== 0 || !Array.isArray(templateResult.data)) {
    throw new Error(`微信模板列表读取失败 ${templateResult.errcode ?? ''}`);
  }
  return templateResult.data;
}

export async function evaluateV053Database(
  phase: PreflightPhase = 'foundation',
  mode: PreflightMode = 'live',
): Promise<PreflightCheck[]> {
  const migrationName = '20260722160000_user_growth_reminders';
  const v054MigrationName = '20260727110000_event_verification_reminders';
  const [migrationRows, v054MigrationRows, tableRows] = await Promise.all([
    prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE migration_name = ${migrationName}
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `,
    prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE migration_name = ${v054MigrationName}
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `,
    prisma.$queryRaw<
      Array<{
        users: string | null;
        aliases: string | null;
        activities: string | null;
        grants: string | null;
        reminders: string | null;
      }>
    >`
      SELECT
        to_regclass('public.users')::text AS users,
        to_regclass('public.user_aliases')::text AS aliases,
        to_regclass('public.user_activity_daily')::text AS activities,
        to_regclass('public.avatar_upload_grants')::text AS grants,
        to_regclass('public.event_reminders')::text AS reminders
    `,
  ]);
  const tables = tableRows[0];
  const checks = [
    check(
      'database_migration',
      migrationRows.length === 1,
      `数据库必须已完成迁移 ${migrationName}`,
    ),
    check(
      'database_tables',
      Boolean(
        tables?.users && tables.aliases && tables.activities && tables.grants && tables.reminders,
      ),
      'V0.5.3 用户、别名、活动、头像凭证和提醒表必须存在',
    ),
  ];
  if (phase === 'reminders') {
    const eligibleRows = await prisma.$queryRaw<
      Array<{ eligible: bigint; signup_eligible: bigint; race_eligible: bigint }>
    >`
      SELECT
        count(DISTINCT e.id) FILTER (
          WHERE e.event_start_at > now() + interval '24 hours'
            OR (
              e.signup_status = 'not_started'
              AND e.signup_start_at > now()
            )
            OR (
              e.signup_status IN ('signup_open', 'closing_soon')
              AND e.signup_deadline > now()
            )
        )::bigint AS eligible,
        count(DISTINCT e.id) FILTER (
          WHERE (
            e.signup_status = 'not_started'
            AND e.signup_start_at > now()
          ) OR (
            e.signup_status IN ('signup_open', 'closing_soon')
            AND e.signup_deadline > now()
          )
        )::bigint AS signup_eligible,
        count(DISTINCT e.id) FILTER (
          WHERE e.event_start_at > now() + interval '24 hours'
        )::bigint AS race_eligible
      FROM events e
      WHERE e.publish_status = 'published'
        AND e.info_status = 'verified'
        AND e.source_level IN ('official', 'trusted')
        AND e.event_date >= CURRENT_DATE
        AND EXISTS (
          SELECT 1
          FROM event_source_summaries s
          WHERE s.event_id = e.id
            AND s.status = 'published'
            AND s.stale_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM event_change_alerts a
          WHERE a.event_id = e.id
            AND a.status = 'open'
        )
    `;
    checks.push(
      check(
        'v054_database_migration',
        v054MigrationRows.length === 1,
        `数据库必须已完成迁移 ${v054MigrationName}`,
      ),
      check(
        'eligible_reminder_event',
        Number(eligibleRows[0]?.eligible || 0) > 0,
        '至少需要一场已核实且具备真实提醒时间的未来赛事',
      ),
      check(
        'race_reminder_events',
        Number(eligibleRows[0]?.race_eligible || 0) >= 2,
        '至少需要两场具备真实开赛时间的赛前提醒赛事',
      ),
      check(
        'signup_reminder_events',
        Number(eligibleRows[0]?.signup_eligible || 0) >= 1,
        '至少需要一场具备有效报名时间的报名提醒赛事',
      ),
    );
    if (mode === 'ready') {
      for (const item of checks.slice(-3)) {
        if (item.status === 'blocker') item.message = `体验版准备：${item.message}`;
      }
    }
  }
  return checks;
}
