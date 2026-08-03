import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class PairDeviceDto {
  @IsString()
  @MinLength(4)
  code!: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class HeartbeatDto {
  @IsString()
  appVersion!: string;

  @IsInt()
  @Min(0)
  freeStorageBytes!: number;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsInt()
  screenWidth?: number;

  @IsOptional()
  @IsInt()
  screenHeight?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class AckCommandDto {
  @IsIn(['done', 'failed'])
  status!: 'done' | 'failed';

  @IsOptional()
  @IsString()
  error?: string;
}

export class ProofOfPlayDto {
  @IsString()
  sceneId!: string;

  @IsString()
  mediaId!: string;

  @IsString()
  startedAt!: string;

  @IsString()
  endedAt!: string;

  @IsString()
  checksum!: string;
}

export class ScreenshotDto {
  @IsString()
  url!: string;
}
