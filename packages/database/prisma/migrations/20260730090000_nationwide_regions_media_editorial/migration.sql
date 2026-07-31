-- 全国公路跑首期：地区代码、人工媒体审核、首页月度编排。
ALTER TABLE "events" ADD COLUMN "province_code" TEXT;
ALTER TABLE "events" ADD COLUMN "city_code" TEXT;
ALTER TABLE "event_candidates" ADD COLUMN "province_code" TEXT;
ALTER TABLE "event_candidates" ADD COLUMN "city_code" TEXT;
ALTER TABLE "user_preferences" ADD COLUMN "province_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "user_preferences" ADD COLUMN "city_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "event_sources" ADD COLUMN "province_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "event_sources" ADD COLUMN "city_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

WITH region(city_name, province_code, city_code) AS (
  VALUES
    ('北京','110000','110100'),('上海','310000','310100'),
    ('南京','320000','320100'),('无锡','320000','320200'),('徐州','320000','320300'),('常州','320000','320400'),('苏州','320000','320500'),('南通','320000','320600'),('连云港','320000','320700'),('淮安','320000','320800'),('盐城','320000','320900'),('扬州','320000','321000'),('镇江','320000','321100'),('泰州','320000','321200'),('宿迁','320000','321300'),
    ('杭州','330000','330100'),('宁波','330000','330200'),('温州','330000','330300'),('嘉兴','330000','330400'),('湖州','330000','330500'),('绍兴','330000','330600'),('金华','330000','330700'),('衢州','330000','330800'),('舟山','330000','330900'),('台州','330000','331000'),('丽水','330000','331100'),
    ('广州','440000','440100'),('深圳','440000','440300'),('珠海','440000','440400'),('汕头','440000','440500'),('佛山','440000','440600'),('江门','440000','440700'),('湛江','440000','440800'),('茂名','440000','440900'),('惠州','440000','441300'),('梅州','440000','441400'),('汕尾','440000','441500'),('河源','440000','441600'),('阳江','440000','441700'),('清远','440000','441800'),('东莞','440000','441900'),('中山','440000','442000'),('肇庆','440000','441200'),('潮州','440000','445100'),('揭阳','440000','445200'),('云浮','440000','445300'),
    ('成都','510000','510100'),('自贡','510000','510300'),('攀枝花','510000','510400'),('泸州','510000','510500'),('德阳','510000','510600'),('绵阳','510000','510700'),('广元','510000','510800'),('遂宁','510000','510900'),('内江','510000','511000'),('乐山','510000','511100'),('南充','510000','511300'),('眉山','510000','511400'),('宜宾','510000','511500'),('广安','510000','511600'),('达州','510000','511700'),('雅安','510000','511800'),('巴中','510000','511900'),('资阳','510000','512000'),('阿坝','510000','513200'),('甘孜','510000','513300'),('凉山','510000','513400'),('重庆','500000','500100'),('武汉','420000','420100'),('黄石','420000','420200'),('十堰','420000','420300'),('宜昌','420000','420500'),('襄阳','420000','420600'),('鄂州','420000','420700'),('荆门','420000','420800'),('孝感','420000','420900'),('荆州','420000','421000'),('黄冈','420000','421100'),('咸宁','420000','421200'),('随州','420000','421300'),('恩施','420000','422800'),('神农架','420000','429004'),('福州','350000','350100'),('厦门','350000','350200'),('莆田','350000','350300'),('三明','350000','350400'),('泉州','350000','350500'),('漳州','350000','350600'),('南平','350000','350700'),('龙岩','350000','350800'),('宁德','350000','350900'),('香港','810000','810100'),('澳门','820000','820100')
)
UPDATE "events" e SET "province_code" = r.province_code, "city_code" = r.city_code
FROM region r WHERE e."province_code" IS NULL AND regexp_replace(e.city, '\\s|市$', '', 'g') = r.city_name;

WITH region(city_name, province_code, city_code) AS (
  VALUES
    ('北京','110000','110100'),('上海','310000','310100'),('南京','320000','320100'),('无锡','320000','320200'),('苏州','320000','320500'),('南通','320000','320600'),('杭州','330000','330100'),('宁波','330000','330200'),('温州','330000','330300'),('广州','440000','440100'),('深圳','440000','440300'),('珠海','440000','440400'),('佛山','440000','440600'),('江门','440000','440700'),('惠州','440000','441300'),('东莞','440000','441900'),('中山','440000','442000'),('成都','510000','510100'),('自贡','510000','510300'),('攀枝花','510000','510400'),('泸州','510000','510500'),('德阳','510000','510600'),('绵阳','510000','510700'),('广元','510000','510800'),('遂宁','510000','510900'),('内江','510000','511000'),('乐山','510000','511100'),('南充','510000','511300'),('眉山','510000','511400'),('宜宾','510000','511500'),('广安','510000','511600'),('达州','510000','511700'),('雅安','510000','511800'),('巴中','510000','511900'),('资阳','510000','512000'),('阿坝','510000','513200'),('甘孜','510000','513300'),('凉山','510000','513400'),('重庆','500000','500100'),('武汉','420000','420100'),('黄石','420000','420200'),('十堰','420000','420300'),('宜昌','420000','420500'),('襄阳','420000','420600'),('鄂州','420000','420700'),('荆门','420000','420800'),('孝感','420000','420900'),('荆州','420000','421000'),('黄冈','420000','421100'),('咸宁','420000','421200'),('随州','420000','421300'),('恩施','420000','422800'),('福州','350000','350100'),('厦门','350000','350200'),('莆田','350000','350300'),('三明','350000','350400'),('泉州','350000','350500'),('漳州','350000','350600'),('南平','350000','350700'),('龙岩','350000','350800'),('宁德','350000','350900'),('香港','810000','810100'),('澳门','820000','820100')
)
UPDATE "event_candidates" c SET "province_code" = r.province_code, "city_code" = r.city_code
FROM region r WHERE c."province_code" IS NULL AND regexp_replace(c.city, '\\s|市$', '', 'g') = r.city_name;

-- The first draft of this migration intentionally kept the existing short list. Keep this
-- supplemental list explicit so older candidates are backfilled without losing compatibility
-- with rows already covered above.
WITH supplemental_region(city_name, province_code, city_code) AS (
  VALUES
    ('徐州','320000','320300'),('常州','320000','320400'),('连云港','320000','320700'),('淮安','320000','320800'),('盐城','320000','320900'),('扬州','320000','321000'),('镇江','320000','321100'),('泰州','320000','321200'),('宿迁','320000','321300'),
    ('嘉兴','330000','330400'),('湖州','330000','330500'),('绍兴','330000','330600'),('金华','330000','330700'),('衢州','330000','330800'),('舟山','330000','330900'),('台州','330000','331000'),('丽水','330000','331100'),
    ('汕头','440000','440500'),('湛江','440000','440800'),('茂名','440000','440900'),('梅州','440000','441400'),('汕尾','440000','441500'),('河源','440000','441600'),('阳江','440000','441700'),('清远','440000','441800'),('肇庆','440000','441200'),('潮州','440000','445100'),('揭阳','440000','445200'),('云浮','440000','445300'),
    ('神农架','420000','429004')
)
UPDATE "event_candidates" c SET "province_code" = r.province_code, "city_code" = r.city_code
FROM supplemental_region r WHERE c."province_code" IS NULL AND regexp_replace(c.city, '\\s|市$', '', 'g') = r.city_name;

WITH region(city_name, province_code, city_code) AS (
  VALUES ('北京','110000','110100'),('上海','310000','310100'),('南京','320000','320100'),('无锡','320000','320200'),('苏州','320000','320500'),('杭州','330000','330100'),('宁波','330000','330200'),('广州','440000','440100'),('深圳','440000','440300'),('珠海','440000','440400'),('佛山','440000','440600'),('江门','440000','440700'),('惠州','440000','441300'),('东莞','440000','441900'),('中山','440000','442000'),('成都','510000','510100'),('自贡','510000','510300'),('攀枝花','510000','510400'),('泸州','510000','510500'),('德阳','510000','510600'),('绵阳','510000','510700'),('广元','510000','510800'),('遂宁','510000','510900'),('内江','510000','511000'),('乐山','510000','511100'),('南充','510000','511300'),('眉山','510000','511400'),('宜宾','510000','511500'),('广安','510000','511600'),('达州','510000','511700'),('雅安','510000','511800'),('巴中','510000','511900'),('资阳','510000','512000'),('阿坝','510000','513200'),('甘孜','510000','513300'),('凉山','510000','513400'),('重庆','500000','500100'),('武汉','420000','420100'),('福州','350000','350100'),('厦门','350000','350200'),('泉州','350000','350500'),('香港','810000','810100'),('澳门','820000','820100'))
UPDATE "user_preferences" p SET
  "province_codes" = COALESCE((SELECT array_agg(DISTINCT r.province_code) FROM unnest(p.cities) city JOIN region r ON regexp_replace(city, '\\s|市$', '', 'g') = r.city_name), ARRAY[]::TEXT[]),
  "city_codes" = COALESCE((SELECT array_agg(DISTINCT r.city_code) FROM unnest(p.cities) city JOIN region r ON regexp_replace(city, '\\s|市$', '', 'g') = r.city_name), ARRAY[]::TEXT[])
WHERE cardinality(p.cities) > 0 AND cardinality(p.city_codes) = 0;

WITH supplemental_region(city_name, province_code, city_code) AS (
  VALUES
    ('徐州','320000','320300'),('常州','320000','320400'),('连云港','320000','320700'),('淮安','320000','320800'),('盐城','320000','320900'),('扬州','320000','321000'),('镇江','320000','321100'),('泰州','320000','321200'),('宿迁','320000','321300'),
    ('嘉兴','330000','330400'),('湖州','330000','330500'),('绍兴','330000','330600'),('金华','330000','330700'),('衢州','330000','330800'),('舟山','330000','330900'),('台州','330000','331000'),('丽水','330000','331100'),
    ('汕头','440000','440500'),('湛江','440000','440800'),('茂名','440000','440900'),('梅州','440000','441400'),('汕尾','440000','441500'),('河源','440000','441600'),('阳江','440000','441700'),('清远','440000','441800'),('肇庆','440000','441200'),('潮州','440000','445100'),('揭阳','440000','445200'),('云浮','440000','445300'),
    ('黄石','420000','420200'),('十堰','420000','420300'),('宜昌','420000','420500'),('襄阳','420000','420600'),('鄂州','420000','420700'),('荆门','420000','420800'),('孝感','420000','420900'),('荆州','420000','421000'),('黄冈','420000','421100'),('咸宁','420000','421200'),('随州','420000','421300'),('恩施','420000','422800'),('神农架','420000','429004'),
    ('莆田','350000','350300'),('三明','350000','350400'),('漳州','350000','350600'),('南平','350000','350700'),('龙岩','350000','350800'),('宁德','350000','350900')
)
UPDATE "user_preferences" p SET
  "province_codes" = ARRAY(SELECT DISTINCT code FROM unnest(COALESCE(p."province_codes", ARRAY[]::TEXT[]) || COALESCE((SELECT array_agg(DISTINCT r.province_code) FROM unnest(p.cities) city JOIN supplemental_region r ON regexp_replace(city, '\\s|市$', '', 'g') = r.city_name), ARRAY[]::TEXT[])) code),
  "city_codes" = ARRAY(SELECT DISTINCT code FROM unnest(COALESCE(p."city_codes", ARRAY[]::TEXT[]) || COALESCE((SELECT array_agg(DISTINCT r.city_code) FROM unnest(p.cities) city JOIN supplemental_region r ON regexp_replace(city, '\\s|市$', '', 'g') = r.city_name), ARRAY[]::TEXT[])) code)
WHERE cardinality(p.cities) > 0;

WITH directory_gap(city_name, province_code, city_code) AS (
  VALUES ('南通','320000','320600'),('温州','330000','330300')
)
UPDATE "user_preferences" p SET
  "province_codes" = ARRAY(SELECT DISTINCT code FROM unnest(p."province_codes" || COALESCE((SELECT array_agg(DISTINCT r.province_code) FROM unnest(p.cities) city JOIN directory_gap r ON regexp_replace(city, '\\s|市$', '', 'g') = r.city_name), ARRAY[]::TEXT[])) code),
  "city_codes" = ARRAY(SELECT DISTINCT code FROM unnest(p."city_codes" || COALESCE((SELECT array_agg(DISTINCT r.city_code) FROM unnest(p.cities) city JOIN directory_gap r ON regexp_replace(city, '\\s|市$', '', 'g') = r.city_name), ARRAY[]::TEXT[])) code)
WHERE cardinality(p.cities) > 0;

WITH shaoguan(city_name, province_code, city_code) AS (VALUES ('韶关','440000','440200'))
UPDATE "events" e SET "province_code" = r.province_code, "city_code" = r.city_code
FROM shaoguan r WHERE e."province_code" IS NULL AND regexp_replace(e.city, '\\s|市$', '', 'g') = r.city_name;
WITH shaoguan(city_name, province_code, city_code) AS (VALUES ('韶关','440000','440200'))
UPDATE "event_candidates" c SET "province_code" = r.province_code, "city_code" = r.city_code
FROM shaoguan r WHERE c."province_code" IS NULL AND regexp_replace(c.city, '\\s|市$', '', 'g') = r.city_name;
WITH shaoguan(city_name, province_code, city_code) AS (VALUES ('韶关','440000','440200'))
UPDATE "user_preferences" p SET
  "province_codes" = CASE WHEN '韶关' = ANY(p.cities) THEN ARRAY(SELECT DISTINCT code FROM unnest(p."province_codes" || ARRAY['440000']) code) ELSE p."province_codes" END,
  "city_codes" = CASE WHEN '韶关' = ANY(p.cities) THEN ARRAY(SELECT DISTINCT code FROM unnest(p."city_codes" || ARRAY['440200']) code) ELSE p."city_codes" END
WHERE cardinality(p.cities) > 0;

CREATE TYPE "MediaAssetReviewStatus" AS ENUM ('pending_review', 'approved_for_display', 'rejected');
CREATE TYPE "HomeEditorialSection" AS ENUM ('focus', 'editors_pick', 'signup_soon', 'recommended');

CREATE TABLE "event_media_assets" (
  "id" TEXT NOT NULL,
  "event_id" TEXT,
  "candidate_id" TEXT,
  "original_url" TEXT,
  "thumbnail_url" TEXT,
  "source_page_url" TEXT NOT NULL,
  "attribution" TEXT,
  "original_file_id" TEXT,
  "cloudbase_file_id" TEXT,
  "thumbnail_file_id" TEXT,
  "sha256" TEXT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "mime_type" TEXT,
  "review_status" "MediaAssetReviewStatus" NOT NULL DEFAULT 'pending_review',
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "discovered_by" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "review_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_media_assets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "event_media_assets_event_id_review_status_is_primary_idx" ON "event_media_assets"("event_id", "review_status", "is_primary");
CREATE INDEX "event_media_assets_candidate_id_review_status_idx" ON "event_media_assets"("candidate_id", "review_status");
CREATE INDEX "event_media_assets_sha256_idx" ON "event_media_assets"("sha256");
ALTER TABLE "event_media_assets" ADD CONSTRAINT "event_media_assets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_media_assets" ADD CONSTRAINT "event_media_assets_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "event_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "home_editorial_plans" (
  "id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "home_editorial_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "home_editorial_plans_month_key" ON "home_editorial_plans"("month");

CREATE TABLE "home_editorial_items" (
  "id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "section" "HomeEditorialSection" NOT NULL,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "home_editorial_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "home_editorial_items_plan_id_section_rank_key" ON "home_editorial_items"("plan_id", "section", "rank");
CREATE UNIQUE INDEX "home_editorial_items_plan_id_section_event_id_key" ON "home_editorial_items"("plan_id", "section", "event_id");
CREATE INDEX "home_editorial_items_event_id_idx" ON "home_editorial_items"("event_id");
ALTER TABLE "home_editorial_items" ADD CONSTRAINT "home_editorial_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "home_editorial_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "home_editorial_items" ADD CONSTRAINT "home_editorial_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
