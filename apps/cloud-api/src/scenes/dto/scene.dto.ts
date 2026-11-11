import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SceneZoneItemInput {
  @IsString()
  mediaId!: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Type(() => Number)
  durationMs?: number;
}

class SceneZoneInput {
  @IsString()
  zoneKey!: string;

  @IsOptional()
  @IsString()
  mediaId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneZoneItemInput)
  items?: SceneZoneItemInput[];
}

export class CreateSceneDto {
  @IsString()
  clientId!: string;

  @IsString()
  layoutId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Type(() => Number)
  durationMs?: number;

  @IsOptional()
  @IsBoolean()
  isHouseAd?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneZoneInput)
  zones?: SceneZoneInput[];
}

export class UpdateSceneDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  layoutId?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Type(() => Number)
  durationMs?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  isHouseAd?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneZoneInput)
  zones?: SceneZoneInput[];
}

export class UpsertCondoNoticeDto {
  /** Grupo (todas as telas) XOR device (tela única). */
  @ValidateIf((o: UpsertCondoNoticeDto) => !o.deviceId)
  @IsString()
  groupId?: string;

  @ValidateIf((o: UpsertCondoNoticeDto) => !o.groupId)
  @IsString()
  deviceId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  mediaIds!: string[];

  /** Duração global de cada story (ms). Default 10000. */
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Type(() => Number)
  durationMs?: number;
}
