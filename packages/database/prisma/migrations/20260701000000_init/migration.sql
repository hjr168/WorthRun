-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('draft', 'published', 'hidden', 'offline', 'archived');

-- CreateEnum
CREATE TYPE "InfoStatus" AS ENUM ('ai_generated', 'pending_verify', 'verified', 'user_flagged', 'source_error');

-- CreateEnum
CREATE TYPE "RunJudgement" AS ENUM ('priority', 'watch', 'unverified');

-- CreateEnum
CREATE TYPE "SignupStatus" AS ENUM ('signup_open', 'closing_soon', 'closed', 'not_started', 'unknown');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('pending', 'handling', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'event_operator', 'content_reviewer', 'readonly');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('active', 'disabled');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "distance_items" TEXT[],
    "start_point" TEXT,
    "end_point" TEXT,
    "signup_status" "SignupStatus" NOT NULL DEFAULT 'unknown',
    "signup_start_at" TIMESTAMP(3),
    "signup_deadline" TIMESTAMP(3),
    "official_url" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT,
    "source_level" TEXT NOT NULL,
    "publish_status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "info_status" "InfoStatus" NOT NULL DEFAULT 'pending_verify',
    "run_judgement" "RunJudgement" NOT NULL DEFAULT 'unverified',
    "judgement_summary" TEXT,
    "judgement_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suitable_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "not_suitable_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "field_confidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_checklist_items" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "item_status" "InfoStatus" NOT NULL DEFAULT 'pending_verify',
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tags" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tag_name" TEXT NOT NULL,
    "tag_type" TEXT NOT NULL DEFAULT 'experience',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_key" TEXT NOT NULL,
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "distances" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "focus_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorites" (
    "id" TEXT NOT NULL,
    "user_key" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "event_id" TEXT,
    "user_key" TEXT,
    "feedback_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "handled_by" TEXT,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'event_operator',
    "status" "AdminStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_operation_logs" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "before_value" JSONB,
    "after_value" JSONB,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" JSONB NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_city_idx" ON "events"("city");

-- CreateIndex
CREATE INDEX "events_event_date_idx" ON "events"("event_date");

-- CreateIndex
CREATE INDEX "events_publish_status_idx" ON "events"("publish_status");

-- CreateIndex
CREATE INDEX "events_signup_status_idx" ON "events"("signup_status");

-- CreateIndex
CREATE INDEX "event_checklist_items_event_id_idx" ON "event_checklist_items"("event_id");

-- CreateIndex
CREATE INDEX "event_tags_event_id_idx" ON "event_tags"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_key_key" ON "user_preferences"("user_key");

-- CreateIndex
CREATE INDEX "user_favorites_event_id_idx" ON "user_favorites"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_favorites_user_key_event_id_key" ON "user_favorites"("user_key", "event_id");

-- CreateIndex
CREATE INDEX "feedback_status_idx" ON "feedback"("status");

-- CreateIndex
CREATE INDEX "feedback_event_id_idx" ON "feedback"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- CreateIndex
CREATE INDEX "admin_operation_logs_target_type_target_id_idx" ON "admin_operation_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "admin_operation_logs_created_at_idx" ON "admin_operation_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_config_key_key" ON "system_configs"("config_key");

-- AddForeignKey
ALTER TABLE "event_checklist_items" ADD CONSTRAINT "event_checklist_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tags" ADD CONSTRAINT "event_tags_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_operation_logs" ADD CONSTRAINT "admin_operation_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

