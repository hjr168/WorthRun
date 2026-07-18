ALTER TYPE "EventInteractionAction" ADD VALUE 'source_summary_open';
ALTER TYPE "EventInteractionAction" ADD VALUE 'source_summary_view';
ALTER TYPE "EventInteractionAction" ADD VALUE 'source_original_link_copy';

CREATE TYPE "EventChoiceType" AS ENUM ('interested', 'considering', 'registered');
CREATE TYPE "SourceSummaryStatus" AS ENUM ('draft', 'published', 'superseded');
CREATE TYPE "SourceSummaryBasis" AS ENUM ('page_text', 'stored_source_record');

CREATE TABLE "user_event_choices" (
  "id" TEXT NOT NULL,
  "user_key" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "choice" "EventChoiceType" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_event_choices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_source_summaries" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "status" "SourceSummaryStatus" NOT NULL DEFAULT 'draft',
  "basis" "SourceSummaryBasis" NOT NULL,
  "source_name" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "source_title" TEXT,
  "summary" TEXT NOT NULL,
  "key_points" TEXT[],
  "limitations" TEXT,
  "content_hash" TEXT NOT NULL,
  "ai_provider" TEXT NOT NULL,
  "ai_model" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMP(3),
  "stale_at" TIMESTAMP(3),
  "reviewed_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_source_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_event_choices_user_key_event_id_key"
  ON "user_event_choices"("user_key", "event_id");
CREATE INDEX "user_event_choices_user_key_choice_updated_at_idx"
  ON "user_event_choices"("user_key", "choice", "updated_at");
CREATE INDEX "user_event_choices_event_id_choice_idx"
  ON "user_event_choices"("event_id", "choice");
CREATE INDEX "user_event_choices_created_at_idx"
  ON "user_event_choices"("created_at");

CREATE UNIQUE INDEX "event_source_summaries_event_id_content_hash_prompt_version_key"
  ON "event_source_summaries"("event_id", "content_hash", "prompt_version");
CREATE INDEX "event_source_summaries_event_id_status_updated_at_idx"
  ON "event_source_summaries"("event_id", "status", "updated_at");
CREATE INDEX "event_source_summaries_status_stale_at_idx"
  ON "event_source_summaries"("status", "stale_at");

ALTER TABLE "user_event_choices"
  ADD CONSTRAINT "user_event_choices_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_source_summaries"
  ADD CONSTRAINT "event_source_summaries_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
