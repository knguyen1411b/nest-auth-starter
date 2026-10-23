import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    Req,
    Request
} from '@nestjs/common'
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'

import { Roles } from '@/common/decorators/roles.decorator'
import type { AuthenticatedRequest } from '@/common/types/authenticated-request'

import { UserQueryDto } from './dto/user-query.dto'
import { CreateUserDto, UpdateUserDto } from './dto/user.dto'
import { UserService } from './user.service'

@ApiTags('Users')
@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Get('me')
    @ApiOperation({ summary: 'Get current user details' })
    @ApiResponse({ status: 200, description: 'Current user details retrieved successfully' })
    getMe(@Request() req: AuthenticatedRequest) {
        return this.userService.getMe(req.user)
    }

    @Post('upload-avatar')
    @HttpCode(200)
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } } })
    @ApiOperation({ summary: 'Upload user avatar' })
    @ApiResponse({ status: 200, description: 'Avatar uploaded successfully' })
    @ApiResponse({ status: 400, description: 'Invalid file format' })
    async uploadAvatar(@Req() req: AuthenticatedRequest) {
        const file = await req.file()
        if (!file) throw new BadRequestException('Empty file')
        return this.userService.uploadAvatar(req.user.id, file.file)
    }

    @Post()
    @Roles('ADMIN', 'EDITOR')
    @ApiOperation({ summary: 'Create a new user' })
    @ApiBody({ type: CreateUserDto })
    @ApiResponse({ status: 201, description: 'User created successfully' })
    @ApiResponse({ status: 409, description: 'Username or email already exists' })
    @ApiResponse({ status: 400, description: 'Validation error' })
    @ApiBody({ type: CreateUserDto })
    create(@Req() req: AuthenticatedRequest, @Body() dto: CreateUserDto) {
        return this.userService.create(dto, req.user)
    }

    @Get()
    @Roles('ADMIN', 'EDITOR')
    @ApiOperation({ summary: 'Get users with pagination and search' })
    @ApiQuery({ name: 'page', required: false, example: 1 })
    @ApiQuery({ name: 'limit', required: false, example: 10 })
    @ApiQuery({ name: 'q', required: false, description: 'Search by username or email' })
    @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
    findAll(@Query() query: UserQueryDto) {
        return this.userService.findAll(query)
    }

    @Get(':id')
    @Roles('ADMIN', 'EDITOR')
    @ApiOperation({ summary: 'Get user by ID' })
    @ApiParam({ name: 'id', description: 'User ID', example: 'b8e6c7c2-9e65-4e5c-8d88-1a7a6c0c3a0b' })
    @ApiResponse({ status: 200, description: 'User found' })
    @ApiResponse({ status: 404, description: 'User not found' })
    findOne(@Param('id') id: string) {
        return this.userService.findOne(id)
    }

    @Patch(':id')
    @Roles('ADMIN', 'EDITOR')
    @ApiOperation({ summary: 'Update user information' })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiBody({ type: UpdateUserDto })
    @ApiResponse({ status: 200, description: 'User updated successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateUserDto) {
        return this.userService.update(id, dto, req.user)
    }

    @Delete(':id')
    @Roles('ADMIN', 'EDITOR')
    @ApiOperation({ summary: 'Delete (soft delete) a user' })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiResponse({ status: 200, description: 'User deleted successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
        return this.userService.remove(id, req.user)
    }
}
