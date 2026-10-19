import { ClientKind } from '@prisma/client';

export function isCondoKind(kind: ClientKind | string | null | undefined) {
  return kind === ClientKind.condo || kind === 'condo';
}

export function isAdvertiserKind(kind: ClientKind | string | null | undefined) {
  return kind === ClientKind.advertiser || kind === 'advertiser';
}

export function isNetworkKind(kind: ClientKind | string | null | undefined) {
  return kind === ClientKind.network || kind === 'network';
}

/** Compat: APIs/UI que ainda leem isCondo. */
export function clientKindToIsCondo(kind: ClientKind | string) {
  return isCondoKind(kind);
}
