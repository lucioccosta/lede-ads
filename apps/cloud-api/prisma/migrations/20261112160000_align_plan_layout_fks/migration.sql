-- Alinha as FKs com o schema.prisma (drift antigo, anterior ao Edge Linux):
--  * Plan.clientId: opcional desde 20261018220000_plan_client_optional, mas a FK
--    continuava ON DELETE RESTRICT (do init). Schema: SetNull (padrão de relação opcional).
--  * Layout.screenTypeId: NOT NULL desde 20261019050000_phase3_schema_cleanup, mas a FK
--    continuava ON DELETE SET NULL (impossível com NOT NULL). Schema: Restrict.
--    O ScreenTypesService já recusa apagar tipo de tela com layouts.

-- DropForeignKey
ALTER TABLE "Plan" DROP CONSTRAINT "Plan_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Layout" DROP CONSTRAINT "Layout_screenTypeId_fkey";

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_screenTypeId_fkey" FOREIGN KEY ("screenTypeId") REFERENCES "ScreenType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
