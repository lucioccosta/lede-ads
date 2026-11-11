-- CreateEnum
ALTER TYPE "MediaStatus" ADD VALUE IF NOT EXISTS 'archived';

-- CreateTable
CREATE TABLE "SceneZoneItem" (
    "id" TEXT NOT NULL,
    "sceneZoneId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SceneZoneItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SceneZoneItem_sceneZoneId_sortOrder_idx" ON "SceneZoneItem"("sceneZoneId", "sortOrder");

-- AddForeignKey
ALTER TABLE "SceneZoneItem" ADD CONSTRAINT "SceneZoneItem_sceneZoneId_fkey" FOREIGN KEY ("sceneZoneId") REFERENCES "SceneZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SceneZoneItem" ADD CONSTRAINT "SceneZoneItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: mediaId existente vira item 0 da playlist
INSERT INTO "SceneZoneItem" ("id", "sceneZoneId", "mediaId", "sortOrder", "durationMs", "createdAt")
SELECT
  gen_random_uuid()::text,
  sz."id",
  sz."mediaId",
  0,
  COALESCE(m."durationMs", 10000),
  CURRENT_TIMESTAMP
FROM "SceneZone" sz
JOIN "Media" m ON m."id" = sz."mediaId"
WHERE sz."mediaId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "SceneZoneItem" i WHERE i."sceneZoneId" = sz."id"
  );
