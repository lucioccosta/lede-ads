export type UserRole =
  | "lede_admin"
  | "lede_operator"
  | "client_viewer"
  | "client_approver";

export type MediaStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected";

export type MediaType = "image" | "video";

export type DeviceStatus = "online" | "offline" | "pairing" | "unknown";

export interface SyncManifest {
  version: string;
  generatedAt: string;
  deviceId: string;
  scenes: SyncScene[];
}

export interface SyncScene {
  id: string;
  name: string;
  durationMs: number;
  layoutId: string;
  layout?: {
    width: number;
    height: number;
  };
  zones: SyncZone[];
}

export interface SyncZone {
  id: string;
  key: string;
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  media: SyncMediaAsset | null;
}

export interface SyncMediaAsset {
  id: string;
  type: MediaType;
  url: string;
  checksum: string;
  durationMs: number;
  mimeType: string;
}

export interface ProofOfPlayPayload {
  deviceId: string;
  sceneId: string;
  mediaId: string;
  startedAt: string;
  endedAt: string;
  checksum: string;
}

export interface HeartbeatPayload {
  deviceId: string;
  appVersion: string;
  freeStorageBytes: number;
  ipAddress?: string;
  screenWidth?: number;
  screenHeight?: number;
}

export interface PairingConfirmPayload {
  code: string;
  deviceName?: string;
}
