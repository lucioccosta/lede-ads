import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { publicBaseUrl } from '../common/public-url';

/**
 * targetId:
 *   sb3000       — produção (GitHub Releases + OTA)
 *   sb3000-fios  — dev local (pasta releases/ + /edge-apks/) — NÃO GitHub
 *   sb3000-casa  — dev local — NÃO GitHub
 *
 * Arquivo: lede-edge-{targetId}-v{X.Y.Z}.apk
 */
export type EdgeTargetId = 'sb3000' | 'sb3000-fios' | 'sb3000-casa';

export const GITHUB_OTA_TARGET: EdgeTargetId = 'sb3000';

export type EdgeReleaseAsset = {
  targetId: EdgeTargetId;
  flavor: 'prod' | 'casa' | 'fios';
  versionName: string;
  tagName: string;
  assetName: string;
  apkUrl: string;
  publishedAt: string;
  sizeBytes: number;
  source: 'github' | 'local';
};

type GhRelease = {
  tag_name: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{
    name: string;
    browser_download_url: string;
    size?: number;
  }>;
};

export function parseVersionCore(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  return m?.[1] ?? null;
}

export function compareVersionCore(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function flavorToTargetId(
  flavor: string | null | undefined,
): EdgeTargetId {
  switch ((flavor || 'prod').toLowerCase()) {
    case 'casa':
      return 'sb3000-casa';
    case 'fios':
      return 'sb3000-fios';
    default:
      return 'sb3000';
  }
}

function targetFlavor(targetId: EdgeTargetId): EdgeReleaseAsset['flavor'] {
  if (targetId === 'sb3000-fios') return 'fios';
  if (targetId === 'sb3000-casa') return 'casa';
  return 'prod';
}

function classifyGithubAsset(
  name: string,
  tagName: string,
  url: string,
  publishedAt: string,
  size: number,
): EdgeReleaseAsset | null {
  if (!name.toLowerCase().endsWith('.apk')) return null;
  const lower = name.toLowerCase();
  const versionName =
    parseVersionCore(name) || parseVersionCore(tagName) || tagName;

  if (
    lower.startsWith('lede-edge-sb3000-fios-v') ||
    lower.startsWith('lede-edge-sb3000-casa-v')
  ) {
    return null;
  }

  const isProdSb3000 =
    lower.startsWith('lede-edge-sb3000-v') ||
    lower.startsWith('lede-edge-fios-prosb3000-v') ||
    lower.startsWith('lede-edge-aquario-stv2000-plus-v');

  if (!isProdSb3000) return null;

  return {
    targetId: 'sb3000',
    flavor: 'prod',
    versionName,
    tagName,
    assetName: name,
    apkUrl: url,
    publishedAt,
    sizeBytes: size,
    source: 'github',
  };
}

@Injectable()
export class EdgeReleaseService {
  private readonly logger = new Logger(EdgeReleaseService.name);
  private ghCache: { at: number; assets: EdgeReleaseAsset[] } | null = null;
  private readonly ttlMs = 5 * 60 * 1000;

  private repo() {
    return (process.env.GITHUB_REPO || 'lucioccosta/lede-ads').replace(
      /^https?:\/\/github\.com\//,
      '',
    );
  }

  /** monorepo/releases/edge — a partir de apps/cloud-api */
  private releasesRoot() {
    return join(process.cwd(), '..', '..', 'releases', 'edge');
  }

  async listLatestAssets(force = false): Promise<EdgeReleaseAsset[]> {
    const local = this.scanAllLocal();
    const github = await this.fetchGithubCached(force);
    return [...github, ...local];
  }

  async resolveForFlavor(
    flavor: string | null | undefined,
  ): Promise<EdgeReleaseAsset | null> {
    const targetId = flavorToTargetId(flavor);

    if (targetId === GITHUB_OTA_TARGET) {
      const github = await this.fetchGithubCached(false);
      const fromGh = this.pickNewest(
        github.filter((a) => a.targetId === GITHUB_OTA_TARGET),
      );
      if (fromGh) return fromGh;
      // fallback local pasta sb3000/
      return this.pickNewest(this.scanLocalTarget(GITHUB_OTA_TARGET));
    }

    // Dev local: só pasta releases/edge/{targetId}/
    return this.pickNewest(this.scanLocalTarget(targetId));
  }

  needsUpdate(opts: {
    appVersion: string | null | undefined;
    appVersionCode: number | null | undefined;
    latest: EdgeReleaseAsset | null;
  }): boolean {
    if (!opts.latest) return false;
    const current = parseVersionCore(opts.appVersion);
    const latest = parseVersionCore(opts.latest.versionName);
    if (!current || !latest) return false;
    return compareVersionCore(latest, current) > 0;
  }

  private scanAllLocal(): EdgeReleaseAsset[] {
    const targets: EdgeTargetId[] = [
      'sb3000',
      'sb3000-fios',
      'sb3000-casa',
    ];
    return targets.flatMap((t) => this.scanLocalTarget(t));
  }

  private scanLocalTarget(targetId: EdgeTargetId): EdgeReleaseAsset[] {
    const dir = join(this.releasesRoot(), targetId);
    if (!existsSync(dir)) return [];

    const prefix = `lede-edge-${targetId}-v`;
    const out: EdgeReleaseAsset[] = [];

    for (const name of readdirSync(dir)) {
      if (!name.toLowerCase().endsWith('.apk')) continue;
      if (!name.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      const full = join(dir, name);
      const st = statSync(full);
      const versionName = parseVersionCore(name) || name;
      out.push({
        targetId,
        flavor: targetFlavor(targetId),
        versionName,
        tagName: `local-${versionName}`,
        assetName: name,
        apkUrl: `${publicBaseUrl()}/edge-apks/${targetId}/${encodeURIComponent(name)}`,
        publishedAt: st.mtime.toISOString(),
        sizeBytes: st.size,
        source: 'local',
      });
    }
    return out;
  }

  private pickNewest(list: EdgeReleaseAsset[]): EdgeReleaseAsset | null {
    if (!list.length) return null;
    return [...list].sort((a, b) => {
      const byVer = compareVersionCore(
        parseVersionCore(b.versionName) || '0.0.0',
        parseVersionCore(a.versionName) || '0.0.0',
      );
      if (byVer !== 0) return byVer;
      return (b.publishedAt || '').localeCompare(a.publishedAt || '');
    })[0]!;
  }

  private async fetchGithubCached(force: boolean): Promise<EdgeReleaseAsset[]> {
    const now = Date.now();
    if (!force && this.ghCache && now - this.ghCache.at < this.ttlMs) {
      return this.ghCache.assets;
    }
    try {
      const assets = await this.fetchFromGithub();
      this.ghCache = { at: now, assets };
      return assets;
    } catch (err) {
      this.logger.warn(
        `GitHub releases: ${err instanceof Error ? err.message : err}`,
      );
      return this.ghCache?.assets ?? [];
    }
  }

  private async fetchFromGithub(): Promise<EdgeReleaseAsset[]> {
    const repo = this.repo();
    const url = `https://api.github.com/repos/${repo}/releases?per_page=15`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'LEDE-Ads-Edge-OTA',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const token = process.env.GITHUB_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new Error(`GitHub HTTP ${res.status}`);
    }
    const releases = (await res.json()) as GhRelease[];
    const out: EdgeReleaseAsset[] = [];

    for (const rel of releases) {
      if (rel.draft) continue;
      const publishedAt = rel.published_at || '';
      for (const asset of rel.assets || []) {
        const classified = classifyGithubAsset(
          asset.name,
          rel.tag_name,
          asset.browser_download_url,
          publishedAt,
          asset.size ?? 0,
        );
        if (classified) out.push(classified);
      }
    }
    this.logger.log(
      `GitHub releases: ${out.length} APK(s) sb3000 (produção) em ${repo}`,
    );
    return out;
  }
}
