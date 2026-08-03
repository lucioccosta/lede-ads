import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  locationLabel?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(['landscape', 'portrait'])
  orientation?: 'landscape' | 'portrait';

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  clientId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  screenTypeId?: string | null;
}

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  locationLabel?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(['landscape', 'portrait'])
  orientation?: 'landscape' | 'portrait';

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  clientId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  screenTypeId?: string | null;
}

export class CreateDeviceCommandDto {
  @IsIn(['resync', 'reboot', 'screenshot'])
  type!: 'resync' | 'reboot' | 'screenshot';
}

export class BatchTimezoneDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  deviceIds!: string[];

  @IsString()
  timezone!: string;
}
