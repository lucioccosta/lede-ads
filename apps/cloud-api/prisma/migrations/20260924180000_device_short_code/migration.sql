-- Código curto de identificação da tela (Cloud + Edge)
ALTER TABLE "Device" ADD COLUMN "shortCode" TEXT;

-- Backfill: 4 hex a partir do id (determinístico) + sufixo se colidir
UPDATE "Device"
SET "shortCode" = upper(substr(md5("id"), 1, 4))
WHERE "shortCode" IS NULL;

-- Resolver colisões raras
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN
    SELECT "id", "shortCode"
    FROM "Device"
    WHERE "shortCode" IN (
      SELECT "shortCode" FROM "Device" GROUP BY "shortCode" HAVING COUNT(*) > 1
    )
    ORDER BY "id"
  LOOP
    n := 0;
    LOOP
      n := n + 1;
      candidate := upper(substr(md5(r."id" || n::text), 1, 4));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "Device" d WHERE d."shortCode" = candidate AND d."id" <> r."id"
      );
    END LOOP;
    UPDATE "Device" SET "shortCode" = candidate WHERE "id" = r."id";
  END LOOP;
END $$;

ALTER TABLE "Device" ALTER COLUMN "shortCode" SET NOT NULL;
CREATE UNIQUE INDEX "Device_shortCode_key" ON "Device"("shortCode");
