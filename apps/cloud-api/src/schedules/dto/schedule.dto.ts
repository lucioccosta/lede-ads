import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

const CHANNELS = [
  'takeover',
  'condo_notice',
  'paid_ad',
  // aliases legados aceitos na API
  'full',
  'condo',
  'ads',
] as const;

export type ScheduleChannelInput = (typeof CHANNELS)[number];

export class CreateScheduleDto {
  @IsString()
  name!: string;

  @IsString()
  clientId!: string;

  @IsString()
  sceneId!: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  planId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  deviceId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  groupId?: string | null;

  @IsOptional()
  @IsIn([...CHANNELS])
  channel?: ScheduleChannelInput;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  priority?: number;

  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  daysOfWeek!: number[];

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sceneId?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  planId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  deviceId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  groupId?: string | null;

  @IsOptional()
  @IsIn([...CHANNELS])
  channel?: ScheduleChannelInput;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  priority?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  daysOfWeek?: number[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;

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
