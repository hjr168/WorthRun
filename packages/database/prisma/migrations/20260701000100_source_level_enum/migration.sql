-- CreateEnum
CREATE TYPE "SourceLevel" AS ENUM ('official', 'trusted', 'secondary', 'unknown');

-- AlterTable
ALTER TABLE "events"
ALTER COLUMN "source_level" DROP DEFAULT,
ALTER COLUMN "source_level" TYPE "SourceLevel"
USING (
  CASE
    WHEN "source_level" IN ('official', 'trusted', 'secondary', 'unknown')
      THEN "source_level"::"SourceLevel"
    ELSE 'unknown'::"SourceLevel"
  END
),
ALTER COLUMN "source_level" SET DEFAULT 'unknown';
