import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { tmpdir } from 'os';

/**
 * Processa vídeos no upload: remove todas as faixas de áudio (anúncios silent).
 * Requer `ffmpeg` no PATH (apt no Docker / brew no macOS).
 */
@Injectable()
export class VideoProcessService {
  private readonly log = new Logger(VideoProcessService.name);

  async stripAudioIfVideo(
    file: Express.Multer.File,
  ): Promise<Express.Multer.File> {
    if (!file.mimetype?.startsWith('video/')) {
      return file;
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
      await this.runFfmpegMute(inputPath, outputPath);
      const outBuf = await readFile(outputPath);
      this.log.log(
        `Áudio removido: ${file.originalname} (${inputBuf.length} → ${outBuf.length} bytes)`,
      );
      return {
        ...file,
        buffer: outBuf,
        size: outBuf.length,
        mimetype: 'video/mp4',
        originalname: this.ensureMp4Name(file.originalname),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Falha ao silenciar vídeo: ${msg}`);
      throw new BadRequestException(
        `Não foi possível processar o vídeo (remover áudio): ${msg}`,
      );
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private ensureMp4Name(name: string) {
    const base = name.replace(/\.[^.]+$/, '') || 'video';
    return `${base}.mp4`;
  }

  private async runFfmpegMute(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    try {
      // -an remove áudio; -c:v copy evita re-encode (rápido)
      await this.spawnFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-c:v',
        'copy',
        '-an',
        '-movflags',
        '+faststart',
        outputPath,
      ]);
    } catch {
      this.log.warn('ffmpeg copy falhou — re-encodando H.264 sem áudio');
      await this.spawnFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        outputPath,
      ]);
    }
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

  private spawnFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const bin = this.resolveFfmpegBin();
      const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > 4000) stderr = stderr.slice(-4000);
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
        const out = args[args.length - 1]!;
        if (code === 0 && existsSync(out)) {
          resolve();
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
