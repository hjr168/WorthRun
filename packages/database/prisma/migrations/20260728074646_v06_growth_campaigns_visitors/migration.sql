-- CreateEnum
CREATE TYPE "GrowthCampaignType" AS ENUM ('wechat_group', 'wechat_moments', 'xiaohongshu', 'running_club', 'running_store', 'coach', 'photographer', 'organizer', 'public_account', 'other');

-- CreateEnum
CREATE TYPE "GrowthCampaignStatus" AS ENUM ('active', 'paused', 'archived');

-- CreateTable
CREATE TABLE "growth_campaigns" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_type" "GrowthCampaignType" NOT NULL,
    "partner_name" TEXT,
    "status" "GrowthCampaignStatus" NOT NULL DEFAULT 'active',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "growth_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth_visitor_daily" (
    "id" TEXT NOT NULL,
    "visitor_key_hash" TEXT NOT NULL,
    "activity_date" DATE NOT NULL,
    "user_id" TEXT,
    "campaign_id" TEXT,
    "referral_share_token" TEXT,
    "first_entry_page" TEXT,
    "first_channel" TEXT,
    "viewed_radar" BOOLEAN NOT NULL DEFAULT false,
    "set_preference" BOOLEAN NOT NULL DEFAULT false,
    "added_favorite" BOOLEAN NOT NULL DEFAULT false,
    "set_choice" BOOLEAN NOT NULL DEFAULT false,
    "subscribed_reminder" BOOLEAN NOT NULL DEFAULT false,
    "copied_official" BOOLEAN NOT NULL DEFAULT false,
    "started_share" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "growth_visitor_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth_visitor_event_view_daily" (
    "id" TEXT NOT NULL,
    "visitor_daily_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "first_viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "growth_visitor_event_view_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "growth_campaigns_code_key" ON "growth_campaigns"("code");

-- CreateIndex
CREATE INDEX "growth_campaigns_status_channel_type_idx" ON "growth_campaigns"("status", "channel_type");

-- CreateIndex
CREATE INDEX "growth_campaigns_created_at_idx" ON "growth_campaigns"("created_at");

-- CreateIndex
CREATE INDEX "growth_visitor_daily_activity_date_campaign_id_idx" ON "growth_visitor_daily"("activity_date", "campaign_id");

-- CreateIndex
CREATE INDEX "growth_visitor_daily_user_id_activity_date_idx" ON "growth_visitor_daily"("user_id", "activity_date");

-- CreateIndex
CREATE INDEX "growth_visitor_daily_referral_share_token_activity_date_idx" ON "growth_visitor_daily"("referral_share_token", "activity_date");

-- CreateIndex
CREATE UNIQUE INDEX "growth_visitor_daily_visitor_key_hash_activity_date_key" ON "growth_visitor_daily"("visitor_key_hash", "activity_date");

-- CreateIndex
CREATE INDEX "growth_visitor_event_view_daily_event_id_first_viewed_at_idx" ON "growth_visitor_event_view_daily"("event_id", "first_viewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "growth_visitor_event_view_daily_visitor_daily_id_event_id_key" ON "growth_visitor_event_view_daily"("visitor_daily_id", "event_id");

-- AddForeignKey
ALTER TABLE "growth_visitor_daily" ADD CONSTRAINT "growth_visitor_daily_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "growth_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_visitor_event_view_daily" ADD CONSTRAINT "growth_visitor_event_view_daily_visitor_daily_id_fkey" FOREIGN KEY ("visitor_daily_id") REFERENCES "growth_visitor_daily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_visitor_event_view_daily" ADD CONSTRAINT "growth_visitor_event_view_daily_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "event_interactions_user_key_hash_event_id_action_occurred_date_" RENAME TO "event_interactions_user_key_hash_event_id_action_occurred_d_key";
