CREATE TYPE "EventChangeAlertStatus" AS ENUM ('open', 'applied', 'dismissed', 'archived_event', 'superseded');

CREATE TYPE "EventChangeSeverity" AS ENUM ('normal', 'important', 'critical');

ALTER TABLE "events"
ADD COLUMN "source_checked_at" TIMESTAMP(3);

ALTER TABLE "event_source_runs"
ADD COLUMN "change_alerts_created" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "change_alerts_existing" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "event_change_alerts" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_run_id" TEXT,
  "source_candidate_id" TEXT,
  "status" "EventChangeAlertStatus" NOT NULL DEFAULT 'open',
  "severity" "EventChangeSeverity" NOT NULL,
  "changed_fields" TEXT[] NOT NULL,
  "before_value" JSONB NOT NULL,
  "after_value" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "source_url" TEXT,
  "fingerprint" TEXT NOT NULL,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "review_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "event_change_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_change_alerts_event_id_source_id_fingerprint_key"
ON "event_change_alerts"("event_id", "source_id", "fingerprint");

CREATE INDEX "event_change_alerts_status_severity_created_at_idx"
ON "event_change_alerts"("status", "severity", "created_at");

CREATE INDEX "event_change_alerts_event_id_status_idx"
ON "event_change_alerts"("event_id", "status");

ALTER TABLE "event_change_alerts"
ADD CONSTRAINT "event_change_alerts_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_change_alerts"
ADD CONSTRAINT "event_change_alerts_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "event_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_change_alerts"
ADD CONSTRAINT "event_change_alerts_source_run_id_fkey"
FOREIGN KEY ("source_run_id") REFERENCES "event_source_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_change_alerts"
ADD CONSTRAINT "event_change_alerts_source_candidate_id_fkey"
FOREIGN KEY ("source_candidate_id") REFERENCES "event_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
