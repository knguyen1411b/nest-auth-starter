import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { randomBytes } from 'crypto'
import { Role, User, UserStatus } from 'generated/prisma/client'

import { MailService } from '@/core/mail/mail.service'
import { PrismaService } from '@/core/prisma/prisma.service'
import { TokenService } from '@/core/security/token.service'

@Injectable()
export class VerificationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly tokens: TokenService,
        private readonly mail: MailService
    ) {}

    async issue(user: Pick<User, 'id' | 'email' | 'fullName'>): Promise<void> {
        const token = randomBytes(32).toString('hex')
        const data = { tokenHash: this.tokens.hash(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) }
        await this.prisma.emailVerification.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...data },
            update: data
        })
        try {
            await this.mail.sendVerifyEmail(user.email, user.fullName ?? 'User', token)
        } catch {
            throw new ServiceUnavailableException(
                'Email delivery unavailable. Please request a new verification email later.'
            )
        }
    }

    async verify(token: string): Promise<void> {
        const tokenHash = this.tokens.hash(token)
        const verification = await this.prisma.emailVerification.findUnique({ where: { tokenHash } })
        if (!verification || verification.expiresAt <= new Date())
            throw new UnauthorizedException('Invalid or expired verification token!')
        await this.prisma.$transaction(async transaction => {
            const consumed = await transaction.emailVerification.deleteMany({
                where: {
                    userId: verification.userId,
                    tokenHash,
                    expiresAt: { gt: new Date() }
                }
            })
            if (consumed.count !== 1) throw new UnauthorizedException('Invalid verification token!')
            const activated = await transaction.user.updateMany({
                where: { id: verification.userId, status: UserStatus.DISABLED, deletedAt: null },
                data: { status: UserStatus.ACTIVE, emailVerifiedAt: new Date() }
            })
            if (activated.count !== 1) throw new UnauthorizedException('Account cannot be activated!')
        })
    }

    async resend(email: string): Promise<void> {
        const user = await this.prisma.user.findUnique({ where: { email } })
        if (
            !user ||
            user.role !== Role.USER ||
            user.status !== UserStatus.DISABLED ||
            user.deletedAt ||
            user.emailVerifiedAt
        )
            return
        const pending = await this.prisma.emailVerification.findUnique({ where: { userId: user.id } })
        if (pending) await this.issue(user)
    }
}
