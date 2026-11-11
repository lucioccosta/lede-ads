import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/** POST /edge/register — chamado pelo Edge sem token. */
export class RegisterEdgeDto {
  /** Identidade estável do hardware (SID do SoC, MAC…). */
  @IsString()
  @Matches(/^[A-Za-z0-9:._-]{8,128}$/)
  hardwareId!: string;

  /** Segredo aleatório gerado pelo Edge (>= 32 chars). */
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  secret!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  enrollmentKey?: string;

  @IsOptional() @IsString() @MaxLength(128) hostname?: string;
  @IsOptional() @IsString() @MaxLength(128) model?: string;
  @IsOptional() @IsString() @MaxLength(64) macAddress?: string;
  @IsOptional() @IsString() @MaxLength(64) ipAddress?: string;
  @IsOptional() @IsString() @MaxLength(32) appVersion?: string;
  @IsOptional() @IsString() @MaxLength(32) appFlavor?: string;

  @IsOptional() @IsInt() @Min(0) @Type(() => Number) screenWidth?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) screenHeight?: number;
}

/** Aceitar: mesmos campos do cadastro manual de tela. */
export class ApproveRegistrationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  locationLabel?: string | null;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(['landscape', 'portrait', 'landscape_reverse', 'portrait_reverse'])
  orientation?: 'landscape' | 'portrait' | 'landscape_reverse' | 'portrait_reverse';

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

export class RejectRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
