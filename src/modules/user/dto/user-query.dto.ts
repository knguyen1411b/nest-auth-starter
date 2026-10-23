import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'

import { PaginationDto } from '@/common/dto/pagination.dto'

export class UserQueryDto extends PaginationDto {
    @ApiPropertyOptional({ description: 'Search username or email' })
    @IsOptional()
    @IsString()
    q?: string

    @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt', 'username', 'email', 'fullName'], default: 'createdAt' })
    @IsOptional()
    @IsIn(['createdAt', 'updatedAt', 'username', 'email', 'fullName'])
    sort: string = 'createdAt'

    @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    order: 'asc' | 'desc' = 'desc'
}
