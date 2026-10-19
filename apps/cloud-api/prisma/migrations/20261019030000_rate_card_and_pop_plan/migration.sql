-- Rate card comercial por praça (DeviceGroup)
ALTER TABLE "DeviceGroup" ADD COLUMN "impactedPeople" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeviceGroup" ADD COLUMN "pricePerScreenCents" INTEGER NOT NULL DEFAULT 0;

-- ProofOfPlay rastreia plano/agenda para cota por grupo
ALTER TABLE "ProofOfPlay" ADD COLUMN "planId" TEXT;
ALTER TABLE "ProofOfPlay" ADD COLUMN "scheduleId" TEXT;

ALTER TABLE "ProofOfPlay" ADD CONSTRAINT "ProofOfPlay_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProofOfPlay" ADD CONSTRAINT "ProofOfPlay_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProofOfPlay_planId_startedAt_idx" ON "ProofOfPlay"("planId", "startedAt");
CREATE INDEX "ProofOfPlay_scheduleId_startedAt_idx" ON "ProofOfPlay"("scheduleId", "startedAt");
