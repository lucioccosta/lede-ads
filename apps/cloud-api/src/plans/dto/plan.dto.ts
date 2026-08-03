import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlanDto {
  @IsString()
  clientId!: string;

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

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  samplesPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sampleDurationSec?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
