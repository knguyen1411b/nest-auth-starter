import { Module } from '@nestjs/common'

import { MailModule } from '@/core/mail/mail.module'
import { PrismaModule } from '@/core/prisma/prisma.module'
import { AuthCoreModule } from '@/core/security/auth-core.module'

import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { PasswordResetService } from './password-reset.service'
import { SessionService } from './session.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import { LocalStrategy } from './strategies/local.strategy'
import { VerificationService } from './verification.service'

@Module({
    imports: [PrismaModule, AuthCoreModule, MailModule],
    controllers: [AuthController],
    providers: [AuthService, PasswordResetService, SessionService, VerificationService, LocalStrategy, JwtStrategy]
})
export class AuthModule {}
