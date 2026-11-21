import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { CatalogService } from './catalog.service';

class CatalogQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(40) genre?: string;
  @IsOptional() @IsIn(['recent', 'trending']) sort?: 'recent' | 'trending';
  @IsOptional() @IsString() @MaxLength(300) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

@ApiTags('catalog')
@Public()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('catalog')
  search(@Query() q: CatalogQueryDto) {
    return this.catalog.search(q);
  }

  @Get('catalog/genres')
  genres() {
    return this.catalog.genres();
  }

  @Get('profiles/:username')
  profile(@Param('username') username: string) {
    return this.catalog.profile(username);
  }
}
