import { Body, Controller, HttpCode, Post, Req, Request, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'

import { Public } from '@/common/decorators/public.decorator'
import type { AuthenticatedRequest } from '@/common/types/authenticated-request'

import { AuthService } from './auth.service'
import {
    ChangePasswordDto,
    EmailVerificationDto,
    ForgotPasswordDto,
    RegisterDto,
    ResetPasswordDto
} from './dto/auth.dto'
import { LocalAuthGuard } from './guards/local-auth.guard'
import { PasswordResetService } from './password-reset.service'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly passwordReset: PasswordResetService
    ) {}

    @Public()
    @Post('forgot-password')
    @HttpCode(200)
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @ApiOperation({ summary: 'Request a password reset; returns success for unknown accounts too' })
    forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.passwordReset.request(dto.email)
    }

    @Public()
    @Post('reset-password')
    @HttpCode(200)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @ApiOperation({ summary: 'Reset password with a one-time token and revoke all sessions' })
    resetPassword(@Body() dto: ResetPasswordDto) {
        return this.passwordReset.reset(dto.token, dto.newPassword)
    }

    @Public()
    @Post('register')
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @ApiOperation({ summary: 'Create a new user account' })
    @ApiResponse({ status: 201, description: 'User registered successfully' })
    @ApiResponse({ status: 409, description: 'Username already exists' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiBody({ type: RegisterDto })
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto)
    }

    @Public()
    @Post('verify-email')
    @HttpCode(200)
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @ApiOperation({ summary: 'Activate an account using the email verification token' })
    verifyEmail(@Body() dto: EmailVerificationDto) {
        return this.authService.verifyEmail(dto.token)
    }

    @Public()
    @Post('resend-verification')
    @HttpCode(200)
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @ApiOperation({ summary: 'Resend verification for a pending registration' })
    resendVerification(@Body() dto: ForgotPasswordDto) {
        return this.authService.resendVerification(dto.email)
    }

    @Public()
    @UseGuards(LocalAuthGuard)
    @HttpCode(200)
    @Post('login')
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @ApiOperation({ summary: 'Login and obtain access token' })
    @ApiResponse({ status: 200, description: 'Login successful, access token issued' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @ApiBody({ schema: { properties: { username: { type: 'string' }, password: { type: 'string' } } } })
    login(@Request() req: AuthenticatedRequest) {
        return this.authService.login(req.user.id, req.user.tokenVersion)
    }

    @Post('change-password')
    @HttpCode(200)
    @ApiOperation({ summary: 'Change user password' })
    @ApiResponse({ status: 200, description: 'Password changed successfully' })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiBody({ type: ChangePasswordDto })
    changePassword(@Request() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
        return this.authService.changePassword(req.user.id, dto)
    }

    @Public()
    @Post('refresh')
    @HttpCode(200)
    @ApiOperation({ summary: 'Refresh access token' })
    @ApiResponse({ status: 200, description: 'Access token refreshed successfully' })
    @ApiResponse({ status: 401, description: 'Invalid refresh token' })
    @ApiBody({ schema: { properties: { refreshToken: { type: 'string' } } } })
    refresh(@Body('refreshToken') refreshToken: string) {
        return this.authService.refresh(refreshToken)
    }

    @Post('logout')
    @HttpCode(200)
    @ApiOperation({ summary: 'Logout from current device' })
    @ApiResponse({ status: 200, description: 'Logged out successfully' })
    @ApiResponse({ status: 401, description: 'Invalid refresh token' })
    @ApiBody({ schema: { properties: { refreshToken: { type: 'string' } } } })
    logout(@Body('refreshToken') refreshToken: string, @Req() req: AuthenticatedRequest) {
        return this.authService.logout(refreshToken, req.user.id)
    }

    @Post('logout-all')
    @HttpCode(200)
    @ApiOperation({ summary: 'Logout from all devices' })
    @ApiResponse({ status: 200, description: 'All sessions revoked' })
    logoutAll(@Req() req: AuthenticatedRequest) {
        return this.authService.logoutAll(req.user.id)
    }
}
