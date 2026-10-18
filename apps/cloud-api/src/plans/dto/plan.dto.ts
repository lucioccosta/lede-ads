import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlanDto {
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  clientId?: string | null;

  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  samplesPerDay!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sampleDurationSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  months?: number;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];
}

export class UpdatePlanDto {
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  clientId?: string | null;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  samplesPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  sampleDurationSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  months?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];
}
