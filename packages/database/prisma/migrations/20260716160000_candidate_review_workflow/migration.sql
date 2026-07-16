ALTER TABLE "event_sources"
ADD COLUMN "source_level" "SourceLevel" NOT NULL DEFAULT 'unknown';

ALTER TABLE "event_candidates"
ADD COLUMN "merged_into_candidate_id" TEXT;

CREATE INDEX "event_candidates_merged_into_candidate_id_idx"
ON "event_candidates"("merged_into_candidate_id");

ALTER TABLE "event_candidates"
ADD CONSTRAINT "event_candidates_merged_into_candidate_id_fkey"
FOREIGN KEY ("merged_into_candidate_id") REFERENCES "event_candidates"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
