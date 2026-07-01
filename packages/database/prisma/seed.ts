import { pbkdf2Sync, randomBytes } from 'node:crypto';
import {
  InfoStatus,
  PrismaClient,
  PublishStatus,
  RunJudgement,
  SignupStatus,
  SourceLevel,
} from '@prisma/client';

const prisma = new PrismaClient();

const checklist = [
  ['报名信息', '报名截止', 'verified'],
  ['报名信息', '是否抽签', 'pending_verify'],
  ['赛事规则', '关门时间', 'pending_verify'],
  ['赛事服务', '领物时间', 'pending_verify'],
  ['路线信息', '官方路线', 'pending_verify'],
  ['风险提示', '天气变化', 'pending_verify'],
  ['风险提示', '赛事变更公告', 'pending_verify'],
] as const;

type SeedEvent = {
  eventName: string;
  city: string;
  eventDate: string;
  distanceItems: string[];
  signupStatus: SignupStatus;
  officialUrl: string;
  sourceName: string;
  sourceUrl: string;
  sourceLevel: SourceLevel;
  runJudgement: RunJudgement;
  judgementSummary: string;
  judgementReasons: string[];
  suitableFor: string[];
  notSuitableFor: string[];
  tags: string[];
};

const events: SeedEvent[] = [
  {
    eventName: '广州半程马拉松',
    city: '广州',
    eventDate: '2026-10-18',
    distanceItems: ['半马', '欢乐跑'],
    signupStatus: SignupStatus.signup_open,
    officialUrl: 'https://example.com/guangzhou-half',
    sourceName: '赛事官方公告',
    sourceUrl: 'https://example.com/guangzhou-half/source',
    sourceLevel: SourceLevel.official,
    runJudgement: RunJudgement.priority,
    judgementSummary: '城市交通便利，半马跑者可优先关注。',
    judgementReasons: ['市区到达较方便', '半马距离适合进阶训练'],
    suitableFor: ['想跑半马的广州及周边跑者', '重视交通便利的跑者'],
    notSuitableFor: ['只想跑全马的跑者'],
    tags: ['交通方便', '新手友好', '周末可去'],
  },
  {
    eventName: '深圳湾迎新跑',
    city: '深圳',
    eventDate: '2026-01-03',
    distanceItems: ['10K', '5K'],
    signupStatus: SignupStatus.not_started,
    officialUrl: 'https://example.com/shenzhen-bay-run',
    sourceName: '赛事官方公众号',
    sourceUrl: 'https://example.com/shenzhen-bay-run/source',
    sourceLevel: SourceLevel.official,
    runJudgement: RunJudgement.watch,
    judgementSummary: '路线友好但信息仍需等官方细则。',
    judgementReasons: ['距离门槛低', '报名细则尚未完整'],
    suitableFor: ['新手跑者', '想轻松参赛的深圳跑者'],
    notSuitableFor: ['需要完整竞赛规程后再决策的跑者'],
    tags: ['新手友好', '风景路线'],
  },
  {
    eventName: '佛山西樵山环湖跑',
    city: '佛山',
    eventDate: '2026-04-12',
    distanceItems: ['15K', '5K'],
    signupStatus: SignupStatus.closing_soon,
    officialUrl: 'https://example.com/foshan-xiqiao',
    sourceName: '赛事组委会信息',
    sourceUrl: 'https://example.com/foshan-xiqiao/source',
    sourceLevel: SourceLevel.trusted,
    runJudgement: RunJudgement.priority,
    judgementSummary: '风景体验突出，适合周末轻旅行式参赛。',
    judgementReasons: ['路线体验较强', '距离设置适合大众跑者'],
    suitableFor: ['喜欢风景路线的跑者', '周末可安排短途出行的跑者'],
    notSuitableFor: ['追求平路 PB 的跑者'],
    tags: ['风景路线', '周末可去'],
  },
  {
    eventName: '东莞松山湖路跑',
    city: '东莞',
    eventDate: '2026-05-24',
    distanceItems: ['半马', '10K'],
    signupStatus: SignupStatus.unknown,
    officialUrl: 'https://example.com/dongguan-songshanhu',
    sourceName: '官方报名页',
    sourceUrl: 'https://example.com/dongguan-songshanhu/source',
    sourceLevel: SourceLevel.official,
    runJudgement: RunJudgement.unverified,
    judgementSummary: '赛事信息待核实，建议先收藏观望。',
    judgementReasons: ['部分时间信息不完整', '需等待官方补充公告'],
    suitableFor: ['东莞本地跑者', '愿意等待信息补齐的跑者'],
    notSuitableFor: ['需要立即确认行程的跑者'],
    tags: ['信息较完整', '交通方便'],
  },
  {
    eventName: '珠海情侣路半程马拉松',
    city: '珠海',
    eventDate: '2026-11-08',
    distanceItems: ['半马'],
    signupStatus: SignupStatus.signup_open,
    officialUrl: 'https://example.com/zhuhai-lovers-road',
    sourceName: '赛事官方网站',
    sourceUrl: 'https://example.com/zhuhai-lovers-road/source',
    sourceLevel: SourceLevel.official,
    runJudgement: RunJudgement.priority,
    judgementSummary: '海滨路线辨识度高，适合重视体验的半马跑者。',
    judgementReasons: ['路线体验鲜明', '半马目标清晰'],
    suitableFor: ['喜欢海滨路线的跑者', '计划半马完赛的跑者'],
    notSuitableFor: ['只关注全马项目的跑者'],
    tags: ['风景路线', '适合 PB', '周末可去'],
  },
];

async function main() {
  const adminPasswordHash = hashPassword('admin');

  await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminPasswordHash, role: 'super_admin', status: 'active' },
    create: {
      id: 'seed-admin',
      username: 'admin',
      passwordHash: adminPasswordHash,
      displayName: '默认管理员',
      role: 'super_admin',
    },
  });

  await prisma.systemConfig.upsert({
    where: { configKey: 'compliance_notice' },
    update: { configValue: 'AI 整理，仅供参考，报名以官方为准。' },
    create: {
      configKey: 'compliance_notice',
      configValue: 'AI 整理，仅供参考，报名以官方为准。',
      description: '赛事信息合规提示',
    },
  });

  await prisma.systemConfig.upsert({
    where: { configKey: 'official_action_text' },
    update: { configValue: '前往官方确认' },
    create: {
      configKey: 'official_action_text',
      configValue: '前往官方确认',
      description: '官方入口统一文案',
    },
  });

  for (const event of events) {
    const eventDate = new Date(event.eventDate);
    const eventData = {
      ...event,
      eventDate,
      infoStatus:
        event.runJudgement === RunJudgement.unverified
          ? InfoStatus.pending_verify
          : InfoStatus.verified,
      publishStatus: PublishStatus.draft,
      fieldConfidence: {
        signupDeadline: 'pending_verify',
        lottery: 'pending_verify',
        cutoffTime: 'pending_verify',
        route: 'pending_verify',
      },
      checklistItems: {
        create: checklist.map(([groupName, itemName, itemStatus], index) => ({
          groupName,
          itemName,
          itemStatus,
          sortOrder: index + 1,
        })),
      },
      eventTags: {
        create: event.tags.map((tagName) => ({
          tagName,
          tagType: 'experience',
        })),
      },
    };

    const existing = await prisma.event.findFirst({
      where: {
        eventName: event.eventName,
        city: event.city,
        eventDate,
      },
    });

    const saved = await prisma.$transaction(async (tx) => {
      if (!existing) {
        return tx.event.create({ data: eventData });
      }

      await tx.eventChecklistItem.deleteMany({ where: { eventId: existing.id } });
      await tx.eventTag.deleteMany({ where: { eventId: existing.id } });
      return tx.event.update({
        where: { id: existing.id },
        data: eventData,
      });
    });

    await prisma.adminOperationLog.create({
      data: {
        adminUserId: 'seed-admin',
        action: existing ? 'event.seed.update' : 'event.seed.create',
        targetType: 'events',
        targetId: saved.id,
        afterValue: { eventName: saved.eventName, city: saved.city },
        note: '导入第一阶段种子赛事',
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$100000$${salt}$${hash}`;
}
