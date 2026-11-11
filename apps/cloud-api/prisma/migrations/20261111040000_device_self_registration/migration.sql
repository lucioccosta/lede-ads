-- CreateEnum
CREATE TYPE "DeviceRegistrationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "DeviceRegistration" (
    "id" TEXT NOT NULL,
    "hardwareId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "DeviceRegistrationStatus" NOT NULL DEFAULT 'pending',
    "hostname" TEXT,
    "model" TEXT,
    "macAddress" TEXT,
    "ipAddress" TEXT,
    "externalIp" TEXT,
    "appVersion" TEXT,
    "appFlavor" TEXT,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "rejectReason" TEXT,
    "deviceId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceRegistration_hardwareId_key" ON "DeviceRegistration"("hardwareId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceRegistration_deviceId_key" ON "DeviceRegistration"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceRegistration_status_lastSeenAt_idx" ON "DeviceRegistration"("status", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "DeviceRegistration" ADD CONSTRAINT "DeviceRegistration_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

