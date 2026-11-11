import {
  EdgeReleaseService,
  artifactExtension,
  flavorToTargetId,
} from './edge-release.service';

function ghRelease(tag: string, assets: string[]) {
  return {
    tag_name: tag,
    published_at: '2026-11-01T00:00:00Z',
    draft: false,
    assets: assets.map((name) => ({
      name,
      browser_download_url: `https://github.com/x/releases/download/${tag}/${name}`,
      size: 123456,
    })),
  };
}

describe('EdgeReleaseService (flavor linux)', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        ghRelease('edge-sb3000-linux-v0.2.0', [
          'lede-edge-sb3000-linux-v0.2.0.tar.zst',
        ]),
        ghRelease('edge-sb3000-linux-v0.1.0', [
          'lede-edge-sb3000-linux-v0.1.0.tar.zst',
          // .tar.gz não é aceito para o target linux
          'lede-edge-sb3000-linux-v0.1.0.tar.gz',
        ]),
        ghRelease('edge-sb3000-v0.5.16', ['lede-edge-sb3000-v0.5.16.apk']),
        // dev local nunca vem do GitHub
        ghRelease('edge-sb3000-fios-v0.9.0', [
          'lede-edge-sb3000-fios-v0.9.0.apk',
        ]),
      ],
      headers: { get: () => null },
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('mapeia flavor → target e extensão', () => {
    expect(flavorToTargetId('linux')).toBe('sb3000-linux');
    expect(flavorToTargetId('prod')).toBe('sb3000');
    expect(flavorToTargetId(null)).toBe('sb3000');
    expect(artifactExtension('sb3000-linux')).toBe('.tar.zst');
    expect(artifactExtension('sb3000')).toBe('.apk');
  });

  it('resolve o pacote Linux mais novo para flavor linux', async () => {
    const svc = new EdgeReleaseService();
    const latest = await svc.resolveForFlavor('linux');
    expect(latest).toMatchObject({
      targetId: 'sb3000-linux',
      flavor: 'linux',
      versionName: '0.2.0',
      assetName: 'lede-edge-sb3000-linux-v0.2.0.tar.zst',
      source: 'github',
    });
  });

  it('não mistura o APK Android com o pacote Linux', async () => {
    const svc = new EdgeReleaseService();
    const prod = await svc.resolveForFlavor('prod');
    expect(prod?.assetName).toBe('lede-edge-sb3000-v0.5.16.apk');
    expect(prod?.targetId).toBe('sb3000');
  });

  it('needsUpdate compara versões do flavor correto', async () => {
    const svc = new EdgeReleaseService();
    const latest = await svc.resolveForFlavor('linux');
    expect(
      svc.needsUpdate({ appVersion: '0.1.0', appVersionCode: 100, latest }),
    ).toBe(true);
    expect(
      svc.needsUpdate({ appVersion: '0.2.0', appVersionCode: 200, latest }),
    ).toBe(false);
  });
});
