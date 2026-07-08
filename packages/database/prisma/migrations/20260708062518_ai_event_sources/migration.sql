-- CreateEnum
CREATE TYPE "EventSourceType" AS ENUM ('page_url', 'search_query', 'rss');

-- CreateEnum
CREATE TYPE "EventSourceStatus" AS ENUM ('active', 'paused');

-- CreateEnum
CREATE TYPE "EventCandidateStatus" AS ENUM ('new', 'needs_review', 'accepted', 'rejected', 'merged');

-- CreateTable
CREATE TABLE "event_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_type" "EventSourceType" NOT NULL DEFAULT 'page_url',
    "entry_url" TEXT,
    "search_query" TEXT,
    "allowed_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city_hints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "EventSourceStatus" NOT NULL DEFAULT 'active',
    "last_run_at" TIMESTAMP(3),
    "last_run_status" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_candidates" (
    "id" TEXT NOT NULL,
    "source_id" TEXT,
    "status" "EventCandidateStatus" NOT NULL DEFAULT 'new',
    "event_name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "event_date" DATE,
    "source_url" TEXT,
    "official_url" TEXT,
    "extracted_data" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "confidence" JSONB,
    "duplicate_event_id" TEXT,
    "accepted_event_id" TEXT,
    "ai_model" TEXT,
    "ai_prompt_version" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_sources_status_idx" ON "event_sources"("status");

-- CreateIndex
CREATE INDEX "event_candidates_status_idx" ON "event_candidates"("status");

-- CreateIndex
CREATE INDEX "event_candidates_source_id_idx" ON "event_candidates"("source_id");

-- CreateIndex
CREATE INDEX "event_candidates_event_name_city_event_date_idx" ON "event_candidates"("event_name", "city", "event_date");

-- AddForeignKey
ALTER TABLE "event_candidates" ADD CONSTRAINT "event_candidates_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "event_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
