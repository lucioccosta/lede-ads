import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  PutObjectCommand,
  S3Client,
  ObjectCannedACL,
} from '@aws-sdk/client-s3';
import { createHash, randomBytes } from 'crypto';
import { extname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { publicBaseUrl } from '../common/public-url';

export type StoredObject = {
  key: string;
  url: string;
  checksum: string;
  fileSize: number;
  mimeType: string;
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly log = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private driver: 's3' | 'local' = 'local';

  onModuleInit() {
    const driver = (process.env.STORAGE_DRIVER ?? 's3').toLowerCase();
    if (driver === 'local') {
      this.driver = 'local';
      this.log.log('Storage: disco local (uploads/)');
      return;
    }

    const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, '');
    const accessKey = process.env.S3_ACCESS_KEY;
    const secretKey = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_BUCKET;

    if (!endpoint || !accessKey || !secretKey || !bucket) {
      this.driver = 'local';
      this.log.warn(
        'S3 incompleto (S3_ENDPOINT/ACCESS/SECRET/BUCKET) — usando disco local',
      );
      return;
    }

    const region = process.env.S3_REGION || 'us-east-1';
    const forcePathStyle =
      (process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false';

    this.client = new S3Client({
      region,
      endpoint: endpoint.startsWith('http')
        ? endpoint
        : `https://${endpoint}`,
      forcePathStyle,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
    this.driver = 's3';
    this.log.log(
      `Storage: S3 bucket=${bucket} endpoint=${endpoint} pathStyle=${forcePathStyle}`,
    );
  }

  isS3() {
    return this.driver === 's3' && Boolean(this.client);
  }

  private publicObjectUrl(key: string) {
    const base = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');
    if (base) return `${base}/${key}`;

    const endpoint = (process.env.S3_ENDPOINT || '').replace(/\/$/, '');
    const bucket = process.env.S3_BUCKET || '';
    const tenant = process.env.S3_TENANT?.trim();
    const host = endpoint.startsWith('http')
      ? endpoint
      : `https://${endpoint}`;
    // Eveo: https://host/{tenant}:{bucket}/key
    const bucketPath = tenant ? `${tenant}:${bucket}` : bucket;
    return `${host}/${bucketPath}/${key}`;
  }

  private buildKey(folder: string, originalName: string, checksum: string) {
    const ext = extname(originalName).toLowerCase() || '';
    const id = randomBytes(8).toString('hex');
    // checksum curto no path ajuda cache do Edge
    return `${folder}/${checksum.slice(0, 16)}-${id}${ext}`;
  }

  async putBuffer(input: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    folder?: string;
  }): Promise<StoredObject> {
    const folder = input.folder ?? 'media';
    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const key = this.buildKey(folder, input.originalName, checksum);
    const fileSize = input.buffer.length;

    if (this.isS3() && this.client) {
      const bucket = process.env.S3_BUCKET!;
      const aclEnv = process.env.S3_ACL; // ex.: public-read
      const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
        ...(aclEnv
          ? { ACL: aclEnv as ObjectCannedACL }
          : {}),
      });
      await this.client.send(cmd);
      return {
        key,
        url: this.publicObjectUrl(key),
        checksum,
        fileSize,
        mimeType: input.mimeType,
      };
    }

    // Fallback local
    const uploadsRoot = join(process.cwd(), 'uploads');
    const localPath = join(uploadsRoot, key);
    const dir = join(uploadsRoot, folder);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(localPath, input.buffer);
    return {
      key,
      url: `${publicBaseUrl()}/uploads/${key}`,
      checksum,
      fileSize,
      mimeType: input.mimeType,
    };
  }

  async putMulterFile(
    file: Express.Multer.File,
    folder = 'media',
  ): Promise<StoredObject> {
    const buffer = file.buffer?.length
      ? file.buffer
      : file.path
        ? await import('fs/promises').then((fs) => fs.readFile(file.path))
        : null;
    if (!buffer) {
      throw new Error('Arquivo sem conteúdo para upload');
    }
    return this.putBuffer({
      buffer,
      mimeType: file.mimetype,
      originalName: file.originalname || 'file.bin',
      folder,
    });
  }
}
