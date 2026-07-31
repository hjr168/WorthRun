import type { Prisma } from '@worth-running/database';
import {
  chinaDateOnly,
  greaterBayAreaCityValues,
  isFutureChinaDate,
  isGreaterBayAreaCity,
  resolveSupportedRegion,
  supportedProvinceCodes,
} from '@worth-running/shared';

export function isNationwideDiscoveryEnabled() {
  return process.env.NATIONWIDE_DISCOVERY_ENABLED === 'true';
}

export function publishBoundaryError(
  city: string,
  eventDate: string,
  now: Date = new Date(),
  region?: { provinceCode?: string | null; cityCode?: string | null },
) {
  if (isNationwideDiscoveryEnabled()) {
    const filled = resolveRegionForBoundary(city, region);
    const resolved = resolveSupportedRegion(city, filled.cityCode);
    if (
      !resolved ||
      (filled.provinceCode && filled.provinceCode !== resolved.provinceCode) ||
      (filled.cityCode && filled.cityCode !== resolved.cityCode)
    ) {
      return '赛事地区不在首期全国公路跑目录，或省市代码待审核';
    }
    // 城市可识别时，缺失的省市代码已由 resolveRegionForBoundary 用城市名兜底补齐，
    // 因此不再因"代码为空"阻塞校验（核验/变更复核等无编辑入口的流程也能放行）。
    // 持久化补齐由各写入流程（保存/核验/变更应用）在落库时一并完成。
  } else if (!isGreaterBayAreaCity(city)) {
    return '当前仅允许发布粤港澳大湾区赛事';
  }
  if (!isFutureChinaDate(eventDate, now)) return '只能发布北京时间未来日期的赛事';
  return null;
}

/**
 * 用城市名兜底补齐缺失的省市行政区代码。城市可识别时返回 resolveSupportedRegion 的结果，
 * 供校验/保存/核验/变更应用等流程统一复用，避免"代码为空但城市明确"导致的死锁。
 * 始终保留传入的非空代码（不覆盖已填值），城市不可识别时对应字段为 null。
 */
export function resolveRegionForBoundary(
  city: string,
  region?: { provinceCode?: string | null; cityCode?: string | null },
) {
  const resolved = resolveSupportedRegion(city);
  return {
    provinceCode: region?.provinceCode || resolved?.provinceCode || null,
    cityCode: region?.cityCode || resolved?.cityCode || null,
  };
}

export function buildPublicEventWhere(now: Date = new Date()): Prisma.EventWhereInput {
  if (isNationwideDiscoveryEnabled()) {
    return {
      publishStatus: 'published',
      provinceCode: { in: supportedProvinceCodes },
      cityCode: { not: null },
      eventDate: { gt: new Date(`${chinaDateOnly(now)}T00:00:00.000Z`) },
    };
  }
  return {
    publishStatus: 'published',
    city: { in: greaterBayAreaCityValues },
    eventDate: { gt: new Date(`${chinaDateOnly(now)}T00:00:00.000Z`) },
  };
}
