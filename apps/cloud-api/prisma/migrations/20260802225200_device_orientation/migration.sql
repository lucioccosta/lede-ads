-- CreateEnum
CREATE TYPE "DeviceOrientation" AS ENUM ('landscape', 'portrait');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "orientation" "DeviceOrientation" NOT NULL DEFAULT 'landscape';
