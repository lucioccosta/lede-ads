-- Remove Plan.sampleDurationSec (duração do slot vive no DeviceGroup)
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "sampleDurationSec";

-- Layout: exigir screenTypeId e dropar string legada
UPDATE "Layout" AS l
SET "screenTypeId" = st.id
FROM "ScreenType" AS st
WHERE l."screenTypeId" IS NULL
  AND l."screenType" = st.slug;

UPDATE "Layout"
SET "screenTypeId" = (SELECT id FROM "ScreenType" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "screenTypeId" IS NULL;

ALTER TABLE "Layout" ALTER COLUMN "screenTypeId" SET NOT NULL;
ALTER TABLE "Layout" DROP COLUMN IF EXISTS "screenType";
