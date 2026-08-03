import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateScreenTypeDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['standard', 'condo_split'])
  mode?: 'standard' | 'condo_split';
}

export class UpdateScreenTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(['standard', 'condo_split'])
  mode?: 'standard' | 'condo_split';

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SetClientScreenTypesDto {
  @IsArray()
  @IsString({ each: true })
  screenTypeIds!: string[];
}
