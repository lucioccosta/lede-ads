import {
  PrismaClient,
  UserRole,
  MediaType,
  MediaStatus,
  ScreenTypeMode,
  ScheduleChannel,
  DeviceOrientation,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash('admin123', 10);
  const clientHash = await bcrypt.hash('cliente123', 10);
  const condoHash = await bcrypt.hash('condo123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@lede.com' },
    update: {},
    create: {
      email: 'admin@lede.com',
      name: 'Admin LEDE',
      role: UserRole.lede_admin,
      passwordHash: adminHash,
    },
  });

  // Cliente LEDE (house ads / Anuncie AQUI)
  const ledeClient = await prisma.client.upsert({
    where: { id: 'seed-client-lede' },
    update: { name: 'LEDE', isCondo: false },
    create: {
      id: 'seed-client-lede',
      name: 'LEDE',
      email: 'house@lede.com',
      isCondo: false,
    },
  });

  // Anunciante (portal cliente — envia/aprova mídias)
  const advertiser = await prisma.client.upsert({
    where: { id: 'seed-client-demo' },
    update: { name: 'CLIENTE DEMO', isCondo: false },
    create: {
      id: 'seed-client-demo',
      name: 'CLIENTE DEMO',
      email: 'cliente@demo.com',
      document: '00.000.000/0001-00',
      isCondo: false,
    },
  });

  await prisma.user.upsert({
    where: { email: 'cliente@demo.com' },
    update: { clientId: advertiser.id, role: UserRole.client_approver },
    create: {
      email: 'cliente@demo.com',
      name: 'Aprovador Demo',
      role: UserRole.client_approver,
      clientId: advertiser.id,
      passwordHash: clientHash,
    },
  });

  // Condomínio (portal — só troca aviso na cena ativa)
  const condo = await prisma.client.upsert({
    where: { id: 'seed-client-condo' },
    update: { name: 'CONDOMINIO DEMO', isCondo: true },
    create: {
      id: 'seed-client-condo',
      name: 'CONDOMINIO DEMO',
      email: 'condo@demo.com',
      document: '11.111.111/0001-11',
      isCondo: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'condo@demo.com' },
    update: { clientId: condo.id, role: UserRole.client_approver },
    create: {
      email: 'condo@demo.com',
      name: 'Síndico Demo',
      role: UserRole.client_approver,
      clientId: condo.id,
      passwordHash: condoHash,
    },
  });

  const typeTv = await prisma.screenType.upsert({
    where: { slug: 'tv-standard' },
    update: {},
    create: {
      name: 'TV Padrão',
      slug: 'tv-standard',
      description: 'Tela cheia sem área exclusiva',
      mode: ScreenTypeMode.standard,
    },
  });

  const typeElevator = await prisma.screenType.upsert({
    where: { slug: 'elevador-split' },
    update: {},
    create: {
      name: 'Elevador Split',
      slug: 'elevador-split',
      description: 'Área do condomínio + anúncios LEDE',
      mode: ScreenTypeMode.condo_split,
    },
  });

  await prisma.clientScreenType.upsert({
    where: {
      clientId_screenTypeId: {
        clientId: condo.id,
        screenTypeId: typeElevator.id,
      },
    },
    update: {},
    create: {
      clientId: condo.id,
      screenTypeId: typeElevator.id,
    },
  });

  const planStarts = new Date();
  const planEnds = new Date(planStarts);
  planEnds.setMonth(planEnds.getMonth() + 3);

  const plan = await prisma.plan.create({
    data: {
      clientId: advertiser.id,
      name: 'Plano 2000 amostragens/dia × 3 meses',
      samplesPerDay: 2000,
      sampleDurationSec: 10,
      months: 3,
      startsAt: planStarts,
      endsAt: planEnds,
    },
  });

  const layoutFull = await prisma.layout.create({
    data: {
      name: 'Full Bleed TV',
      screenType: typeTv.slug,
      screenTypeId: typeTv.id,
      width: 1920,
      height: 1080,
      zonesJson: [
        {
          key: 'main',
          label: 'Principal',
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          role: 'full',
        },
      ],
    },
  });

  const layoutElevator = await prisma.layout.create({
    data: {
      name: 'Elevador Retrato Split',
      screenType: typeElevator.slug,
      screenTypeId: typeElevator.id,
      width: 1080,
      height: 1920,
      zonesJson: [
        {
          key: 'condo',
          label: 'Condomínio',
          x: 0,
          y: 0,
          width: 1080,
          height: 672,
          role: 'condo',
        },
        {
          key: 'ads',
          label: 'Anúncios LEDE',
          x: 0,
          y: 672,
          width: 1080,
          height: 1248,
          role: 'ads',
        },
      ],
    },
  });

  const mediaHouse = await prisma.media.create({
    data: {
      clientId: ledeClient.id,
      name: 'Anuncie AQUI',
      type: MediaType.image,
      mimeType: 'image/png',
      url: 'https://placehold.co/1080x1248/b45309/ffffff/png?text=Anuncie+AQUI',
      checksum: 'demo-house-checksum',
      durationMs: 10000,
      status: MediaStatus.approved,
    },
  });

  const mediaAds = await prisma.media.create({
    data: {
      clientId: advertiser.id,
      name: 'Spot Ads Demo',
      type: MediaType.image,
      mimeType: 'image/png',
      url: 'https://placehold.co/1080x1248/1a1a1a/ffffff/png?text=LEDE+Ads',
      checksum: 'demo-ads-checksum',
      durationMs: 10000,
      status: MediaStatus.approved,
    },
  });

  const mediaCondo = await prisma.media.create({
    data: {
      clientId: condo.id,
      name: 'Aviso Condomínio',
      type: MediaType.image,
      mimeType: 'image/png',
      url: 'https://placehold.co/1080x672/0f766e/ffffff/png?text=Aviso+Condominio',
      checksum: 'demo-condo-checksum',
      durationMs: 10000,
      status: MediaStatus.approved,
    },
  });

  const sceneFull = await prisma.scene.create({
    data: {
      clientId: advertiser.id,
      layoutId: layoutFull.id,
      name: 'Cena Demo',
      durationMs: 10000,
      zones: {
        create: [{ zoneKey: 'main', mediaId: mediaAds.id }],
      },
    },
  });

  const sceneCondo = await prisma.scene.create({
    data: {
      clientId: condo.id,
      layoutId: layoutElevator.id,
      name: 'Cena Condo',
      durationMs: 10000,
      zones: {
        create: [
          { zoneKey: 'condo', mediaId: mediaCondo.id },
          { zoneKey: 'ads', mediaId: mediaAds.id },
        ],
      },
    },
  });

  const sceneAds = await prisma.scene.create({
    data: {
      clientId: advertiser.id,
      layoutId: layoutElevator.id,
      name: 'Cena Ads Elevador',
      durationMs: 10000,
      zones: {
        create: [{ zoneKey: 'ads', mediaId: mediaAds.id }],
      },
    },
  });

  const sceneHouse = await prisma.scene.create({
    data: {
      clientId: ledeClient.id,
      layoutId: layoutElevator.id,
      name: 'Anuncie AQUI',
      durationMs: 10000,
      isHouseAd: true,
      zones: {
        create: [{ zoneKey: 'ads', mediaId: mediaHouse.id }],
      },
    },
  });

  const deviceGroup = await prisma.deviceGroup.create({
    data: {
      name: 'Elevadores Condo Demo',
      clientId: condo.id,
      viewingHoursPerDay: 18,
      sampleDurationSec: 10,
      houseSceneId: sceneHouse.id,
    },
  });

  await prisma.planDeviceGroup.create({
    data: {
      planId: plan.id,
      deviceGroupId: deviceGroup.id,
    },
  });

  const deviceLobby = await prisma.device.create({
    data: {
      name: 'TV Lobby',
      shortCode: 'L0B1',
      pairingCode: 'ABC123',
      locationLabel: 'Recepção',
      status: 'pairing',
      screenTypeId: typeTv.id,
      orientation: DeviceOrientation.landscape,
    },
  });

  const deviceElevator = await prisma.device.create({
    data: {
      name: 'Elevador Demo',
      shortCode: 'ELV1',
      pairingCode: 'ELV001',
      locationLabel: 'Elevador A',
      status: 'pairing',
      clientId: condo.id,
      groupId: deviceGroup.id,
      screenTypeId: typeElevator.id,
      orientation: DeviceOrientation.portrait,
      timezone: 'America/Manaus',
    },
  });

  await prisma.schedule.create({
    data: {
      name: 'Rotação diária',
      clientId: advertiser.id,
      sceneId: sceneFull.id,
      planId: plan.id,
      deviceId: deviceLobby.id,
      channel: ScheduleChannel.full,
      priority: 10,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '00:00',
      endTime: '23:59',
    },
  });

  await prisma.schedule.create({
    data: {
      name: 'Condo elevador',
      clientId: condo.id,
      sceneId: sceneCondo.id,
      deviceId: deviceElevator.id,
      groupId: deviceGroup.id,
      channel: ScheduleChannel.condo,
      priority: 20,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '00:00',
      endTime: '23:59',
    },
  });

  await prisma.schedule.create({
    data: {
      name: 'Ads elevador',
      clientId: advertiser.id,
      sceneId: sceneAds.id,
      planId: plan.id,
      groupId: deviceGroup.id,
      channel: ScheduleChannel.ads,
      priority: 10,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '00:00',
      endTime: '23:59',
    },
  });

  console.log('Seed OK');
  console.log({
    admin: admin.email,
    advertiser: 'cliente@demo.com / cliente123',
    condo: 'condo@demo.com / condo123',
    pairingLobby: 'ABC123',
    pairingElevator: 'ELV001',
    deviceGroup: deviceGroup.name,
    houseAd: sceneHouse.name,
    screenTypes: [typeTv.slug, typeElevator.slug],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
