import { Type } from '@nestjs/common';
import { ApiProperty, getSchemaPath } from '@nestjs/swagger';

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function PaginatedDto<T>(itemType: Type<T>) {
  class PaginatedResponseDto implements Paginated<T> {
    @ApiProperty({ type: 'array', items: { $ref: getSchemaPath(itemType) } })
    items!: T[];

    @ApiProperty({ example: 1, minimum: 1 })
    page!: number;

    @ApiProperty({ example: 20, minimum: 1, maximum: 100 })
    limit!: number;

    @ApiProperty({ example: 42, minimum: 0 })
    total!: number;

    @ApiProperty({ example: 3, minimum: 0 })
    pages!: number;
  }
  return PaginatedResponseDto;
}
