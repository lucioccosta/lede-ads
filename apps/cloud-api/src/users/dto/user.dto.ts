import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateClientUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsIn(['client_viewer', 'client_approver'])
  role?: 'client_viewer' | 'client_approver';
}

export class UpdateUserPasswordDto {
  @IsString()
  @MinLength(6)
  password!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsIn(['client_viewer', 'client_approver'])
  role?: 'client_viewer' | 'client_approver';

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateTeamUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(['lede_admin', 'lede_operator'])
  role!: 'lede_admin' | 'lede_operator';
}

export class UpdateTeamUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsIn(['lede_admin', 'lede_operator'])
  role?: 'lede_admin' | 'lede_operator';

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
