import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SceneZoneInput {
  @IsString()
  zoneKey!: string;

  @IsOptional()
  @IsString()
  mediaId?: string | null;
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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneZoneInput)
  zones?: SceneZoneInput[];
}
