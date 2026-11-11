/**
 * One-off: normaliza dimensões dos vídeos JÁ cadastrados para o decoder de
 * hardware do Edge Linux (largura %32, altura %16) e remove áudio.
 *
 * Usa os mesmos serviços do upload (ffmpeg + StorageService → S3/local).
 * Vídeos já seguros são ignorados. O checksum muda → os Edges baixam de novo.
 *
 *   # dentro do container da API (produção):
 *   node dist/src/scripts/normalize-videos.js --dry-run
 *   node dist/src/scripts/normalize-videos.js
 *
 *   # local:
 *   npx ts-node src/scripts/normalize-videos.ts --dry-run
 */
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MediaStatus, PrismaClient } from '@prisma/client';
import { VideoProcessService, isEdgeSafe } from '../uploads/video-process.service';
import { StorageService } from '../storage/storage.service';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

function urlToLocalPath(url: string): string | null {
  const marker = '/uploads/';
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return join(process.cwd(), 'uploads', url.slice(idx + marker.length).split('?')[0]!);
}

async function loadBytes(url: string): Promise<Buffer> {
  const local = urlToLocalPath(url);
  if (local && existsSync(local)) return readFile(local);
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`download ${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const video = new VideoProcessService();
  const storage = new StorageService();
  storage.onModuleInit();

  const items = await prisma.media.findMany({
    where: { type: 'video', status: { not: MediaStatus.archived } },
    select: { id: true, name: true, url: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`${items.length} vídeo(s)${dryRun ? ' — DRY RUN, nada será alterado' : ''}`);

  let changed = 0;
  let failed = 0;
  for (const m of items) {
    const prefix = `• ${m.name} (${m.id})`;
    const dir = join(tmpdir(), `lede-norm-${randomBytes(4).toString('hex')}`);
    try {
      await mkdir(dir, { recursive: true });
      const input = await loadBytes(m.url);
      const inPath = join(dir, 'in.mp4');
      await writeFile(inPath, input);
      const probe = await video.probe(inPath);
      if (!probe) {
        console.log(`${prefix}: sem stream de vídeo — ignorado`);
        continue;
      }
      if (isEdgeSafe(probe.width, probe.height)) {
        console.log(`${prefix}: ${probe.width}x${probe.height} já seguro`);
        continue;
      }
      if (dryRun) {
        console.log(`${prefix}: ${probe.width}x${probe.height} → seria normalizado`);
        changed++;
        continue;
      }
      const res = await video.processVideo({
        fieldname: 'file',
        originalname: `${m.name}.mp4`,
        encoding: '7bit',
        mimetype: 'video/mp4',
        size: input.length,
        buffer: input,
      } as Express.Multer.File);
      const stored = await storage.putMulterFile(res.file, 'media');
      await prisma.media.update({
        where: { id: m.id },
        data: {
          url: stored.url,
          checksum: stored.checksum,
          fileSize: stored.fileSize,
          mimeType: stored.mimeType,
        },
      });
      changed++;
      console.log(
        `${prefix}: ${probe.width}x${probe.height} → ${res.width}x${res.height} ` +
          `(${input.length} → ${stored.fileSize} bytes)`,
      );
    } catch (err) {
      failed++;
      console.error(`${prefix}: FALHOU — ${err instanceof Error ? err.message : err}`);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  console.log(
    `${dryRun ? 'Seriam normalizados' : 'Normalizados'}: ${changed} · falhas: ${failed}`,
  );
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
