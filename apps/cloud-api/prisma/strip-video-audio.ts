/**
 * One-off: remove áudio de todos os Media type=video já gravados.
 * Uso: npx ts-node prisma/strip-video-audio.ts
 */
import { createHash, randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile, rm } from 'fs/promises';
import { extname, join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string | null;
    if (p && existsSync(p)) return p;
  } catch {
    /* ignore */
  }
  return 'ffmpeg';
}

function spawnFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = resolveFfmpeg();
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const out = args[args.length - 1]!;
      if (code === 0 && existsSync(out)) resolve();
      else
        reject(
          new Error(
            `ffmpeg ${code}: ${stderr.trim().split('\n').slice(-3).join(' ')}`,
          ),
        );
    });
  });
}

async function stripAudio(inputBuf: Buffer, originalName: string): Promise<Buffer> {
  const workDir = join(tmpdir(), `lede-strip-${randomBytes(6).toString('hex')}`);
  await mkdir(workDir, { recursive: true });
  const ext = (extname(originalName) || '.mp4').toLowerCase();
  const inputPath = join(workDir, `in${ext}`);
  const outputPath = join(workDir, 'out.mp4');
  try {
    await writeFile(inputPath, inputBuf);
    try {
      await spawnFfmpeg([
        '-y', '-i', inputPath,
        '-map', '0:v:0', '-c:v', 'copy', '-an',
        '-movflags', '+faststart', outputPath,
      ]);
    } catch {
      await spawnFfmpeg([
        '-y', '-i', inputPath,
        '-map', '0:v:0', '-c:v', 'libx264', '-preset', 'veryfast',
        '-crf', '23', '-pix_fmt', 'yuv420p', '-an',
        '-movflags', '+faststart', outputPath,
      ]);
    }
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function hasAudioStream(buf: Buffer): Promise<boolean> {
  const workDir = join(tmpdir(), `lede-probe-${randomBytes(4).toString('hex')}`);
  await mkdir(workDir, { recursive: true });
  const path = join(workDir, 'probe.mp4');
  try {
    await writeFile(path, buf);
    return await new Promise((resolve) => {
      const bin = resolveFfmpeg();
      const child = spawn(bin, ['-i', path], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString();
      });
      child.on('close', () => {
        resolve(/Audio:/i.test(stderr) || /Stream #\d+:\d+.*Audio/i.test(stderr));
      });
      child.on('error', () => resolve(true));
    });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function urlToLocalPath(url: string): string | null {
  const marker = '/uploads/';
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const key = url.slice(idx + marker.length).split('?')[0];
  return join(process.cwd(), 'uploads', key!);
}

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
}

async function loadBytes(url: string): Promise<Buffer> {
  const local = urlToLocalPath(url);
  if (local && existsSync(local)) {
    return readFile(local);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function putLocal(buffer: Buffer, originalName: string) {
  const checksum = createHash('sha256').update(buffer).digest('hex');
  const ext = extname(originalName).toLowerCase() || '.mp4';
  const key = `media/${checksum.slice(0, 16)}-${randomBytes(8).toString('hex')}${ext}`;
  const dir = join(process.cwd(), 'uploads', 'media');
  await mkdir(dir, { recursive: true });
  await writeFile(join(process.cwd(), 'uploads', key), buffer);
  return {
    key,
    url: `${publicBase()}/uploads/${key}`,
    checksum,
    fileSize: buffer.length,
    mimeType: 'video/mp4' as const,
  };
}

async function main() {
  const videos = await prisma.media.findMany({
    where: { type: 'video' },
    select: {
      id: true,
      name: true,
      url: true,
      checksum: true,
      fileSize: true,
      mimeType: true,
    },
  });
  console.log(`Encontrados ${videos.length} vídeo(s)`);

  for (const m of videos) {
    process.stdout.write(`• ${m.name} (${m.id})… `);
    const input = await loadBytes(m.url);
    const audio = await hasAudioStream(input);
    if (!audio) {
      console.log('já sem áudio — skip');
      continue;
    }
    const muted = await stripAudio(input, `${m.name}.mp4`);
    const stored = await putLocal(muted, `${m.name}.mp4`);
    await prisma.media.update({
      where: { id: m.id },
      data: {
        url: stored.url,
        checksum: stored.checksum,
        fileSize: stored.fileSize,
        mimeType: stored.mimeType,
      },
    });
    console.log(
      `ok (${input.length} → ${stored.fileSize} bytes, checksum=${stored.checksum.slice(0, 12)}…)`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
