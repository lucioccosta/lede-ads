-- AlterTable Plan
ALTER TABLE "Plan" ADD COLUMN "months" INTEGER NOT NULL DEFAULT 1;

-- AlterTable Scene
ALTER TABLE "Scene" ADD COLUMN "isHouseAd" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable DeviceGroup
CREATE TABLE "DeviceGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "viewingHoursPerDay" INTEGER NOT NULL DEFAULT 18,
    "sampleDurationSec" INTEGER NOT NULL DEFAULT 10,
    "houseSceneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable PlanDeviceGroup
CREATE TABLE "PlanDeviceGroup" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "deviceGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanDeviceGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable Device
ALTER TABLE "Device" ADD COLUMN "groupId" TEXT;

-- AlterTable Schedule
ALTER TABLE "Schedule" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PlanDeviceGroup_planId_deviceGroupId_key" ON "PlanDeviceGroup"("planId", "deviceGroupId");

-- AddForeignKey
ALTER TABLE "DeviceGroup" ADD CONSTRAINT "DeviceGroup_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeviceGroup" ADD CONSTRAINT "DeviceGroup_houseSceneId_fkey" FOREIGN KEY ("houseSceneId") REFERENCES "Scene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanDeviceGroup" ADD CONSTRAINT "PlanDeviceGroup_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanDeviceGroup" ADD CONSTRAINT "PlanDeviceGroup_deviceGroupId_fkey" FOREIGN KEY ("deviceGroupId") REFERENCES "DeviceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Device" ADD CONSTRAINT "Device_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DeviceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DeviceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
