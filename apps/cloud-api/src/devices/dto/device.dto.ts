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
  @IsIn(['landscape', 'portrait', 'landscape_reverse', 'portrait_reverse'])
  orientation?:
    | 'landscape'
    | 'portrait'
    | 'landscape_reverse'
    | 'portrait_reverse';

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  clientId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  groupId?: string | null;

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
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  locationLabel?: string | null;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(['landscape', 'portrait', 'landscape_reverse', 'portrait_reverse'])
  orientation?:
    | 'landscape'
    | 'portrait'
    | 'landscape_reverse'
    | 'portrait_reverse';

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  clientId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  groupId?: string | null;

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

export class BatchCreateDevicesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  names!: string[];

  @IsOptional()
  @IsString()
  locationLabel?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(['landscape', 'portrait', 'landscape_reverse', 'portrait_reverse'])
  orientation?:
    | 'landscape'
    | 'portrait'
    | 'landscape_reverse'
    | 'portrait_reverse';

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  clientId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  groupId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  screenTypeId?: string | null;
}
