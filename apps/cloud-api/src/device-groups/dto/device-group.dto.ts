import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDeviceGroupDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  clientId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  viewingHoursPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sampleDurationSec?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  houseSceneId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deviceIds?: string[];
}

export class UpdateDeviceGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  viewingHoursPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sampleDurationSec?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  houseSceneId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deviceIds?: string[];
}
