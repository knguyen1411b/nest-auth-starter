import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { randomBytes } from 'crypto'
import { UserStatus } from 'generated/prisma/client'

import { MailService } from '@/core/mail/mail.service'
import { PrismaService } from '@/core/prisma/prisma.service'
import { PasswordService } from '@/core/security/password.service'
import { TokenService } from '@/core/security/token.service'

@Injectable()
export class PasswordResetService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly passwords: PasswordService,
        private readonly tokens: TokenService,
        private readonly mail: MailService
    ) {}

    async request(email: string): Promise<void> {
        const user = await this.prisma.user.findUnique({ where: { email } })
        if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) return
        const token = randomBytes(32).toString('hex')
        const data = {
            tokenHash: this.tokens.hash(token),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            tokenVersion: user.tokenVersion
        }
        await this.prisma.passwordReset.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...data },
            update: data
        })
        try {
            await this.mail.sendPasswordReset(user.email, user.fullName ?? 'User', token)
        } catch {
            throw new ServiceUnavailableException('Email delivery unavailable. Please try again later.')
        }
    }

    async reset(token: string, password: string): Promise<void> {
        const tokenHash = this.tokens.hash(token)
        const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash } })
        if (!reset || reset.expiresAt <= new Date()) throw new UnauthorizedException('Invalid or expired reset token')
        const passwordHash = await this.passwords.hash(password)
        await this.prisma.$transaction(async transaction => {
            const consumed = await transaction.passwordReset.deleteMany({
                where: { userId: reset.userId, tokenHash, expiresAt: { gt: new Date() } }
            })
            if (consumed.count !== 1) throw new UnauthorizedException('Invalid or expired reset token')
            const changed = await transaction.user.updateMany({
                where: {
                    id: reset.userId,
                    tokenVersion: reset.tokenVersion,
                    status: UserStatus.ACTIVE,
                    deletedAt: null
                },
                data: { passwordHash, tokenVersion: { increment: 1 } }
            })
            if (changed.count !== 1) throw new UnauthorizedException('Account cannot reset password')
            await transaction.refreshToken.deleteMany({ where: { userId: reset.userId } })
        })
    }
}
