import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ZoneDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsInt()
  @Type(() => Number)
  x!: number;

  @IsInt()
  @Type(() => Number)
  y!: number;

  @IsInt()
  @Type(() => Number)
  width!: number;

  @IsInt()
  @Type(() => Number)
  height!: number;

  @IsOptional()
  @IsIn(['full', 'condo', 'ads'])
  role?: 'full' | 'condo' | 'ads';
}

export class CreateLayoutDto {
  @IsString()
  name!: string;

  @IsString()
  screenType!: string;

  @IsOptional()
  @IsString()
  screenTypeId?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  width!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  height!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ZoneDto)
  zones!: ZoneDto[];
}

export class UpdateLayoutDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  screenType?: string;

  @IsOptional()
  @IsString()
  screenTypeId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ZoneDto)
  zones?: ZoneDto[];
}
