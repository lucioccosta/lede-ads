import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  VideoProcessService,
  edgeSafeDimensions,
  isEdgeSafe,
  parseFfmpegProbe,
} from './video-process.service';

describe('edgeSafeDimensions', () => {
  it('arredonda para largura %32 e altura %16 (para cima)', () => {
    expect(edgeSafeDimensions(1920, 1080)).toEqual({ width: 1920, height: 1088 });
    expect(edgeSafeDimensions(1080, 1920)).toEqual({ width: 1088, height: 1920 });
    expect(edgeSafeDimensions(720, 1280)).toEqual({ width: 736, height: 1280 });
    expect(edgeSafeDimensions(720, 834)).toEqual({ width: 736, height: 848 });
    expect(edgeSafeDimensions(1280, 720)).toEqual({ width: 1280, height: 720 });
  });

  it('isEdgeSafe segue a regra medida no cedrus', () => {
    expect(isEdgeSafe(1280, 720)).toBe(true);
    expect(isEdgeSafe(1920, 1088)).toBe(true);
    expect(isEdgeSafe(1920, 1080)).toBe(false);
    expect(isEdgeSafe(1080, 1920)).toBe(false);
  });
});

describe('parseFfmpegProbe', () => {
  it('lê codec e dimensões', () => {
    const stderr =
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':\n" +
      '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 720x834 [SAR 1:1 DAR 120:139], 510 kb/s, 60 fps\n';
    expect(parseFfmpegProbe(stderr)).toEqual({ codec: 'h264', width: 720, height: 834 });
  });

  it('troca largura/altura em vídeos rotacionados (celular)', () => {
    const stderr =
      '  Stream #0:0(und): Video: hevc (Main), yuv420p(tv), 1920x1080, 30 fps\n' +
      '    Side data:\n      displaymatrix: rotation of -90.00 degrees\n';
    expect(parseFfmpegProbe(stderr)).toEqual({ codec: 'hevc', width: 1080, height: 1920 });
  });

  it('retorna null sem stream de vídeo', () => {
    expect(parseFfmpegProbe('Stream #0:0: Audio: aac, 44100 Hz')).toBeNull();
  });
});

// Integração com ffmpeg real (ffmpeg-static é dependência da API)
const ffmpegBin = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string | null;
    return p && existsSync(p) ? p : null;
  } catch {
    return null;
  }
})();

(ffmpegBin ? describe : describe.skip)('VideoProcessService (ffmpeg real)', () => {
  const svc = new VideoProcessService();
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'lede-vp-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function makeVideo(name: string, size: string, withAudio: boolean) {
    const out = join(dir, name);
    const args = [
      '-v', 'error', '-y',
      '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`,
      ...(withAudio ? ['-f', 'lavfi', '-i', 'sine=frequency=440'] : []),
      '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      ...(withAudio ? ['-c:a', 'aac', '-shortest'] : []),
      out,
    ];
    execFileSync(ffmpegBin!, args);
    return out;
  }

  function asMulter(path: string): Express.Multer.File {
    const buffer = readFileSync(path);
    return {
      fieldname: 'file',
      originalname: 'criativo.mov',
      encoding: '7bit',
      mimetype: 'video/quicktime',
      size: buffer.length,
      buffer,
    } as Express.Multer.File;
  }

  it('normaliza 1080x1920 → 1088x1920 e remove o áudio', async () => {
    const res = await svc.processVideo(asMulter(makeVideo('p.mp4', '1080x1920', true)));
    expect(res.normalized).toBe(true);
    expect(res.file.mimetype).toBe('video/mp4');
    expect(res.file.originalname).toBe('criativo.mp4');
    const outPath = join(dir, 'p-out.mp4');
    require('fs').writeFileSync(outPath, res.file.buffer);
    const probe = await svc.probe(outPath);
    expect(probe).toMatchObject({ codec: 'h264', width: 1088, height: 1920 });
    let stderr = '';
    try {
      execFileSync(ffmpegBin!, ['-hide_banner', '-i', outPath], { stdio: 'pipe' });
    } catch (e) {
      stderr = String((e as { stderr: Buffer }).stderr);
    }
    expect(stderr).not.toMatch(/Audio:/);
  }, 60_000);

  it('não re-encoda vídeo já seguro (1280x720) — só remove o áudio', async () => {
    const src = makeVideo('ok.mp4', '1280x720', true);
    const res = await svc.processVideo(asMulter(src));
    expect(res.normalized).toBe(false);
    expect(res).toMatchObject({ width: 1280, height: 720 });
  }, 60_000);
});
