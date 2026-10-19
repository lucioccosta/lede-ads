-- ClientKind replaces isCondo
CREATE TYPE "ClientKind" AS ENUM ('condo', 'advertiser', 'network');

ALTER TABLE "Client" ADD COLUMN "kind" "ClientKind" NOT NULL DEFAULT 'advertiser';

UPDATE "Client" SET "kind" = 'condo' WHERE "isCondo" = true;
UPDATE "Client" SET "kind" = 'network'
WHERE "isCondo" = false AND (LOWER("name") = 'lede' OR "id" = 'seed-client-lede');

ALTER TABLE "Client" DROP COLUMN "isCondo";

-- Rename ScheduleChannel values
ALTER TYPE "ScheduleChannel" RENAME VALUE 'full' TO 'takeover';
ALTER TYPE "ScheduleChannel" RENAME VALUE 'condo' TO 'condo_notice';
ALTER TYPE "ScheduleChannel" RENAME VALUE 'ads' TO 'paid_ad';
