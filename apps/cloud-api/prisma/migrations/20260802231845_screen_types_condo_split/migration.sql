-- CreateEnum
CREATE TYPE "ScreenTypeMode" AS ENUM ('standard', 'condo_split');

-- CreateEnum
CREATE TYPE "ScheduleChannel" AS ENUM ('full', 'condo', 'ads');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "screenTypeId" TEXT;

-- AlterTable
ALTER TABLE "Layout" ADD COLUMN     "screenTypeId" TEXT;

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "channel" "ScheduleChannel" NOT NULL DEFAULT 'full';

-- CreateTable
CREATE TABLE "ScreenType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "mode" "ScreenTypeMode" NOT NULL DEFAULT 'standard',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreenType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientScreenType" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "screenTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientScreenType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScreenType_slug_key" ON "ScreenType"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClientScreenType_clientId_screenTypeId_key" ON "ClientScreenType"("clientId", "screenTypeId");

-- AddForeignKey
ALTER TABLE "ClientScreenType" ADD CONSTRAINT "ClientScreenType_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientScreenType" ADD CONSTRAINT "ClientScreenType_screenTypeId_fkey" FOREIGN KEY ("screenTypeId") REFERENCES "ScreenType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_screenTypeId_fkey" FOREIGN KEY ("screenTypeId") REFERENCES "ScreenType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_screenTypeId_fkey" FOREIGN KEY ("screenTypeId") REFERENCES "ScreenType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
