import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { tmpdir } from 'os';

export type VideoProbe = {
  codec: string;
  /** Dimensões de exibição (já considerando rotação do container). */
  width: number;
  height: number;
};

/**
 * Dimensões que o decoder de hardware do Edge Linux (cedrus, SoC H313)
 * decodifica corretamente: largura múltipla de 32 e altura múltipla de 16.
 * Fora disso o driver corrompe o plano de cor (cores lavadas + riscos).
 * Arredonda PARA CIMA (no máx. +31 px / +15 px → ≤ ~2% em vídeos de 720 px).
 */
export function edgeSafeDimensions(width: number, height: number) {
  const even = (n: number) => Math.max(2, n);
  return {
    width: even(Math.ceil(width / 32) * 32),
    height: even(Math.ceil(height / 16) * 16),
  };
}

export function isEdgeSafe(width: number, height: number) {
  return width % 32 === 0 && height % 16 === 0;
}

/** Lê codec/dimensões do stderr do `ffmpeg -i` (sem depender de ffprobe). */
export function parseFfmpegProbe(stderr: string): VideoProbe | null {
  const m = stderr.match(
    /Stream #\d+:\d+[^\n]*?: Video: (\w+)[^\n]*?, (\d{2,5})x(\d{2,5})/,
  );
  if (!m) return null;
  let width = Number(m[2]);
  let height = Number(m[3]);
  // Vídeos de celular: "displaymatrix: rotation of -90.00 degrees" / "rotate : 90"
  const rot =
    stderr.match(/rotation of (-?[\d.]+) degrees/) ??
    stderr.match(/rotate\s*:\s*(-?\d+)/);
  if (rot && Math.abs(Math.round(Number(rot[1]))) % 180 === 90) {
    [width, height] = [height, width];
  }
  return { codec: m[1], width, height };
}

/**
 * Processa vídeos no upload:
 * - remove todas as faixas de áudio (anúncios silent);
 * - normaliza dimensões para o decoder de hardware do Edge Linux
 *   (re-encode H.264 só quando necessário; senão cópia rápida do stream).
 * Requer `ffmpeg` no PATH (apt no Docker / brew no macOS) ou ffmpeg-static.
 */
@Injectable()
export class VideoProcessService {
  private readonly log = new Logger(VideoProcessService.name);

  async processVideo(file: Express.Multer.File): Promise<{
    file: Express.Multer.File;
    normalized: boolean;
    width?: number;
    height?: number;
  }> {
    if (!file.mimetype?.startsWith('video/')) {
      return { file, normalized: false };
    }

    const inputBuf = file.buffer?.length
      ? file.buffer
      : file.path
        ? await readFile(file.path)
        : null;
    if (!inputBuf?.length) {
      throw new BadRequestException('Arquivo de vídeo vazio');
    }

    const workDir = join(
      tmpdir(),
      `lede-video-${randomBytes(6).toString('hex')}`,
    );
    await mkdir(workDir, { recursive: true });
    const ext = (extname(file.originalname) || '.mp4').toLowerCase();
    const inputPath = join(workDir, `in${ext}`);
    const outputPath = join(workDir, `out.mp4`);

    try {
      await writeFile(inputPath, inputBuf);
      const probe = await this.probe(inputPath);
      const result = await this.transcode(inputPath, outputPath, probe);
      const outBuf = await readFile(outputPath);
      this.log.log(
        `Vídeo processado: ${file.originalname} ` +
          (probe ? `${probe.width}x${probe.height}` : '?') +
          (result.normalized ? ` → ${result.width}x${result.height}` : ' (dimensões ok)') +
          ` (${inputBuf.length} → ${outBuf.length} bytes, sem áudio)`,
      );
      return {
        file: {
          ...file,
          buffer: outBuf,
          size: outBuf.length,
          mimetype: 'video/mp4',
          originalname: this.ensureMp4Name(file.originalname),
        },
        ...result,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Falha ao processar vídeo: ${msg}`);
      throw new BadRequestException(
        `Não foi possível processar o vídeo: ${msg}`,
      );
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Compat: nome antigo usado antes da normalização de dimensões. */
  async stripAudioIfVideo(file: Express.Multer.File) {
    return (await this.processVideo(file)).file;
  }

  async probe(inputPath: string): Promise<VideoProbe | null> {
    // `ffmpeg -i` sem saída sai com código 1, mas imprime os streams no stderr
    const stderr = await this.runFfmpeg(['-hide_banner', '-i', inputPath], true);
    return parseFfmpegProbe(stderr);
  }

  async transcode(
    inputPath: string,
    outputPath: string,
    probe: VideoProbe | null,
  ): Promise<{ normalized: boolean; width?: number; height?: number }> {
    const needsResize = probe ? !isEdgeSafe(probe.width, probe.height) : false;

    if (!needsResize) {
      try {
        // -an remove áudio; -c:v copy evita re-encode (rápido)
        await this.runFfmpeg([
          '-y', '-i', inputPath,
          '-map', '0:v:0', '-c:v', 'copy', '-an',
          '-movflags', '+faststart', outputPath,
        ]);
        return { normalized: false, width: probe?.width, height: probe?.height };
      } catch {
        this.log.warn('ffmpeg copy falhou — re-encodando H.264 sem áudio');
      }
    }

    const target = probe
      ? edgeSafeDimensions(probe.width, probe.height)
      : null;
    const vf = target
      ? `scale=${target.width}:${target.height}:flags=lanczos,setsar=1`
      : 'scale=trunc(iw/32)*32:trunc(ih/16)*16,setsar=1';
    await this.runFfmpeg([
      '-y', '-i', inputPath,
      '-map', '0:v:0',
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-an', '-movflags', '+faststart', outputPath,
    ]);
    return {
      normalized: needsResize,
      width: target?.width,
      height: target?.height,
    };
  }

  private ensureMp4Name(name: string) {
    const base = name.replace(/\.[^.]+$/, '') || 'video';
    return `${base}.mp4`;
  }

  private resolveFfmpegBin(): string {
    if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
      return process.env.FFMPEG_PATH;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const staticBin = require('ffmpeg-static') as string | null;
      if (staticBin && existsSync(staticBin)) return staticBin;
    } catch {
      /* pacote opcional em ambientes com ffmpeg de sistema */
    }
    return 'ffmpeg';
  }

  /** Executa ffmpeg; retorna o stderr. `probeOnly` aceita código ≠ 0. */
  private runFfmpeg(args: string[], probeOnly = false): Promise<string> {
    return new Promise((resolve, reject) => {
      const bin = this.resolveFfmpegBin();
      const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
      });
      child.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(
            new Error(
              'ffmpeg não encontrado — instale ffmpeg, use o pacote ffmpeg-static ou defina FFMPEG_PATH',
            ),
          );
        } else {
          reject(err);
        }
      });
      child.on('close', (code) => {
        if (probeOnly) return resolve(stderr);
        const out = args[args.length - 1]!;
        if (code === 0 && existsSync(out)) {
          resolve(stderr);
        } else {
          reject(
            new Error(
              `ffmpeg saiu com código ${code}: ${stderr.trim().split('\n').slice(-3).join(' ')}`,
            ),
          );
        }
      });
    });
  }
}
