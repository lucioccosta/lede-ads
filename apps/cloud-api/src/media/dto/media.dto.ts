import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MediaStatus, MediaType } from '@prisma/client';

export class CreateMediaDto {
  @IsString()
  clientId!: string;

  @IsString()
  name!: string;

  @IsEnum(MediaType)
  type!: MediaType;

  @IsString()
  mimeType!: string;

  @IsString()
  url!: string;

  @IsString()
  checksum!: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Type(() => Number)
  durationMs?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  fileSize?: number;

  @IsOptional()
  @IsEnum(MediaStatus)
  status?: MediaStatus;
}

export class UpdateMediaDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  durationMs?: number;

  @IsOptional()
  @IsEnum(MediaStatus)
  status?: MediaStatus;
}

export class ReviewMediaDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
