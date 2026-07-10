ALTER TYPE "EventSourceType" ADD VALUE 'chinaath_api';

ALTER TABLE "event_candidates"
ADD COLUMN "source_external_id" TEXT,
ADD COLUMN "raw_payload" JSONB,
ADD COLUMN "extractor_version" TEXT;

CREATE UNIQUE INDEX "event_candidates_source_id_source_external_id_key"
ON "event_candidates"("source_id", "source_external_id");
