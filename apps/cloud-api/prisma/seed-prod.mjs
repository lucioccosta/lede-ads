/**
 * Seed mínimo para produção/Dokploy (sem ts-node).
 * Ativado com RUN_SEED=true no primeiro deploy.
 */
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@lede.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const adminHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: process.env.SEED_ADMIN_NAME || 'Admin LEDE',
      role: 'lede_admin',
      passwordHash: adminHash,
    },
  });

  console.log(`[seed-prod] admin OK: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error('[seed-prod] falhou', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
