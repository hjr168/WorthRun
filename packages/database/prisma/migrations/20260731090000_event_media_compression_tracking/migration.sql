-- 赛事媒体压缩追踪：记录云函数 sharp 是否生效及各产物实际字节数，
-- 用于观测图片压缩是否真正执行（修复 sharp 静默降级导致主图≈原图的问题）。
ALTER TABLE "event_media_assets" ADD COLUMN "processed_by_sharp" BOOLEAN;
ALTER TABLE "event_media_assets" ADD COLUMN "original_bytes" INTEGER;
ALTER TABLE "event_media_assets" ADD COLUMN "hero_bytes" INTEGER;
ALTER TABLE "event_media_assets" ADD COLUMN "thumbnail_bytes" INTEGER;
