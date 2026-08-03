-- CreateEnum
CREATE TYPE "DeviceCommandType" AS ENUM ('resync', 'reboot', 'screenshot');

-- CreateEnum
CREATE TYPE "DeviceCommandStatus" AS ENUM ('pending', 'done', 'failed');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Manaus';

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "DeviceCommandType" NOT NULL,
    "status" "DeviceCommandStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ackedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_status_createdAt_idx" ON "DeviceCommand"("deviceId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
