import type { SourceCandidate } from './ai/sources/sourceCandidate.js';

export const CHINAATH_PLAN_2026_URL =
  'https://file.shuzixindong.com/changzheng/84554/fddbe29f6e434035918201d2a17dbcac.pdf';

interface PlanRecord {
  sequence: number;
  eventName: string;
  city: string;
  eventDate: string | null;
  plannedMonth: string;
  distanceItems: string[];
  organizer: string;
  grade: string;
}

export const chinaAthPlan2026Records: PlanRecord[] = [
  {
    sequence: 303,
    eventName: '2026顺德半程马拉松',
    city: '佛山',
    eventDate: '2026-11-08',
    plannedMonth: '11月',
    distanceItems: ['半程马拉松'],
    organizer: '顺德区人民政府',
    grade: 'A',
  },
  {
    sequence: 304,
    eventName: '2026中山翠亨新区半程马拉松',
    city: '中山',
    eventDate: '2026-11-08',
    plannedMonth: '11月',
    distanceItems: ['半程马拉松'],
    organizer: '中山市人民政府',
    grade: 'C',
  },
  {
    sequence: 305,
    eventName: '2026佛山市环两江稻田马拉松',
    city: '佛山',
    eventDate: '2026-11-22',
    plannedMonth: '11月',
    distanceItems: ['马拉松', '半程马拉松'],
    organizer: '佛山市文化广电旅游体育局、高明区人民政府',
    grade: 'B',
  },
  {
    sequence: 308,
    eventName: '2026惠州马拉松',
    city: '惠州',
    eventDate: '2026-11-29',
    plannedMonth: '11月',
    distanceItems: ['马拉松', '半程马拉松'],
    organizer: '惠州市人民政府',
    grade: 'A',
  },
  {
    sequence: 309,
    eventName: '2026东莞松山湖马拉松',
    city: '东莞',
    eventDate: null,
    plannedMonth: '11月',
    distanceItems: ['马拉松', '半程马拉松'],
    organizer: '东莞市人民政府',
    grade: 'C',
  },
  {
    sequence: 310,
    eventName: '2026虎门半程马拉松',
    city: '东莞',
    eventDate: null,
    plannedMonth: '11月',
    distanceItems: ['半程马拉松'],
    organizer: '虎门镇人民政府',
    grade: 'A',
  },
  {
    sequence: 311,
    eventName: '2026肇庆马拉松',
    city: '肇庆',
    eventDate: null,
    plannedMonth: '11月',
    distanceItems: ['马拉松', '半程马拉松'],
    organizer: '肇庆市人民政府',
    grade: 'A',
  },
  {
    sequence: 313,
    eventName: '2026珠海马拉松',
    city: '珠海',
    eventDate: '2026-12-06',
    plannedMonth: '12月',
    distanceItems: ['马拉松', '半程马拉松'],
    organizer: '珠海市人民政府',
    grade: 'B',
  },
  {
    sequence: 314,
    eventName: '2026广州马拉松',
    city: '广州',
    eventDate: '2026-12-20',
    plannedMonth: '12月',
    distanceItems: ['马拉松'],
    organizer: '广州市人民政府',
    grade: 'A',
  },
  {
    sequence: 315,
    eventName: '2026深圳南山半程马拉松',
    city: '深圳',
    eventDate: '2026-12-20',
    plannedMonth: '12月',
    distanceItems: ['半程马拉松'],
    organizer: '南山区人民政府',
    grade: 'A',
  },
  {
    sequence: 316,
    eventName: '2026横琴马拉松',
    city: '珠海',
    eventDate: '2026-12-27',
    plannedMonth: '12月',
    distanceItems: ['马拉松', '半程马拉松'],
    organizer: '横琴粤澳深度合作区执行委员会',
    grade: 'A',
  },
  {
    sequence: 319,
    eventName: '2026江门马拉松',
    city: '江门',
    eventDate: null,
    plannedMonth: '12月',
    distanceItems: ['马拉松', '半程马拉松'],
    organizer: '江门市人民政府',
    grade: 'A',
  },
  {
    sequence: 320,
    eventName: '2026黄埔马拉松',
    city: '广州',
    eventDate: null,
    plannedMonth: '12月',
    distanceItems: ['马拉松', '半程马拉松'],
    organizer: '黄埔区人民政府',
    grade: 'A',
  },
  {
    sequence: 322,
    eventName: '2026深圳马拉松',
    city: '深圳',
    eventDate: null,
    plannedMonth: '12月',
    distanceItems: ['马拉松'],
    organizer: '深圳市人民政府',
    grade: 'A',
  },
];

export function buildChinaAthPlan2026Candidates(): SourceCandidate[] {
  return chinaAthPlan2026Records.map((record) => {
    const quote = [
      `序号${record.sequence}`,
      record.eventName,
      record.eventDate || record.plannedMonth,
      record.organizer,
      record.distanceItems.join('/'),
      `${record.grade}类`,
    ].join('；');
    return {
      sourceExternalId: `chinaath-plan-2026-${record.sequence}`,
      rawPayload: { ...record },
      extractorVersion: 'chinaath-plan-2026-v1',
      aiModel: null,
      aiPromptVersion: null,
      candidate: {
        eventName: record.eventName,
        city: record.city,
        eventDate: record.eventDate,
        distanceItems: record.distanceItems,
        signupStatus: 'unknown',
        signupDeadline: null,
        officialUrl: null,
        sourceName: '中国田径协会2026年马拉松赛事计划',
        sourceUrl: CHINAATH_PLAN_2026_URL,
        sourceLevel: 'official',
        runJudgement: 'unverified',
        judgementSummary: record.eventDate
          ? '赛事名称、计划日期和项目来自中国田径协会年度计划，报名入口仍需人工核验。'
          : `年度计划仅公布${record.plannedMonth}，具体比赛日期和报名入口需人工补充。`,
        judgementReasons: ['赛事列入中国田径协会2026年马拉松赛事计划'],
        suitableFor: [],
        notSuitableFor: [],
        tags: [`田协${record.grade}类`, '年度计划'],
        evidence: [{ field: 'sourceRecord', sourceUrl: CHINAATH_PLAN_2026_URL, quote }],
        confidence: {
          eventName: 'verified',
          city: 'verified',
          eventDate: record.eventDate ? 'verified' : 'pending_verify',
          distanceItems: 'verified',
          officialUrl: 'pending_verify',
          signupStatus: 'pending_verify',
        },
      },
    };
  });
}
