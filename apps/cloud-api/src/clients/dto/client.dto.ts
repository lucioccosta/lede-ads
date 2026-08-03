import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isCondo?: boolean;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  document?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsBoolean()
  isCondo?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
