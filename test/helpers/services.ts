import { ConfigService as NestConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

import { LoggerService } from '@/common/logger/logger.service'
import { ConfigService } from '@/core/config/config.service'
import { MailMessage, MailTransport } from '@/core/mail/mail-transport.service'
import { MailService } from '@/core/mail/mail.service'
import { PrismaService } from '@/core/prisma/prisma.service'
import { JwtTokenService } from '@/core/security/jwt-token.service'
import { PasswordService } from '@/core/security/password.service'
import { TokenService } from '@/core/security/token.service'
import { AuthService } from '@/modules/auth/auth.service'
import { SessionService } from '@/modules/auth/session.service'
import { VerificationService } from '@/modules/auth/verification.service'

import { loggerMock } from './fixtures'

export function authServices(database: unknown) {
    const config = new ConfigService(
        new NestConfigService({
            auth: {
                jwt: {
                    secret: process.env.JWT_SECRET,
                    expiresIn: 900,
                    refreshExpiresIn: 604800000,
                    sessionMaxAge: 2592000000
                }
            }
        })
    )
    const passwords = new PasswordService()
    const tokens = new TokenService()
    const jwt = new JwtService()
    const sessions = new SessionService(database as PrismaService, config, tokens)
    const mailer = { sendMail: jest.fn<Promise<unknown>, [MailMessage]>().mockResolvedValue({}) }
    const mail = new MailService(mailer as unknown as MailTransport, loggerMock() as unknown as LoggerService)
    const verification = new VerificationService(database as PrismaService, tokens, mail)
    const auth = new AuthService(
        database as PrismaService,
        passwords,
        new JwtTokenService(jwt, config),
        sessions,
        verification
    )
    return { auth, config, passwords, tokens, jwt, mailer }
}
