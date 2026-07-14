CREATE TYPE "EventSourceRunTrigger" AS ENUM ('manual', 'scheduled');
CREATE TYPE "EventSourceRunStatus" AS ENUM ('running', 'succeeded', 'failed');

ALTER TABLE "event_sources"
ADD COLUMN "schedule_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "schedule_interval_hours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN "page_size" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN "max_pages_per_run" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "next_page" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "next_run_at" TIMESTAMP(3),
ADD COLUMN "last_success_at" TIMESTAMP(3),
ADD COLUMN "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "run_lock_token" TEXT,
ADD COLUMN "run_lock_expires_at" TIMESTAMP(3);

ALTER TABLE "event_candidates"
ADD COLUMN "priority_score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "review_issues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "event_source_runs" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "trigger" "EventSourceRunTrigger" NOT NULL,
    "status" "EventSourceRunStatus" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "start_page" INTEGER,
    "end_page" INTEGER,
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "total_available" INTEGER,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped_reviewed" INTEGER NOT NULL DEFAULT 0,
    "duplicate_events" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_source_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_sources_status_schedule_enabled_next_run_at_idx"
ON "event_sources"("status", "schedule_enabled", "next_run_at");

CREATE INDEX "event_source_runs_source_id_started_at_idx"
ON "event_source_runs"("source_id", "started_at");

CREATE INDEX "event_source_runs_status_started_at_idx"
ON "event_source_runs"("status", "started_at");

ALTER TABLE "event_source_runs"
ADD CONSTRAINT "event_source_runs_source_id_fkey"
FOREIGN KEY ("source_id") REFERENCES "event_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
