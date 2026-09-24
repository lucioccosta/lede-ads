-- AlterEnum
ALTER TYPE "DeviceCommandType" ADD VALUE IF NOT EXISTS 'update';

-- AlterTable Device
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "appVersionCode" INTEGER;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "appFlavor" TEXT;

-- AlterTable DeviceCommand
ALTER TABLE "DeviceCommand" ADD COLUMN IF NOT EXISTS "payloadJson" JSONB;
