import { Injectable, UnauthorizedException } from '@nestjs/common'
import { RefreshToken, UserStatus } from 'generated/prisma/client'

import { ConfigService } from '@/core/config/config.service'
import { PrismaService } from '@/core/prisma/prisma.service'
import { TokenService } from '@/core/security/token.service'

@Injectable()
export class SessionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly tokens: TokenService
    ) {}

    async create(userId: string, tokenVersion?: number): Promise<string> {
        const issued = this.tokens.generateRefreshToken()
        const now = new Date()
        const absoluteExpiresAt = new Date(now.getTime() + this.config.getAuthConfig().jwt.sessionMaxAge)
        await this.prisma.$transaction(async transaction => {
            await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${userId}, 0))`
            const user = await transaction.user.findUnique({ where: { id: userId } })
            if (
                !user ||
                user.status !== UserStatus.ACTIVE ||
                user.deletedAt ||
                (tokenVersion !== undefined && user.tokenVersion !== tokenVersion)
            )
                throw new UnauthorizedException('Account unavailable')
            await transaction.refreshToken.deleteMany({ where: { userId, expiresAt: { lte: now } } })
            await transaction.usedRefreshToken.deleteMany({ where: { expiresAt: { lte: now } } })
            const sessions = await transaction.refreshToken.findMany({
                where: { userId },
                orderBy: { createdAt: 'asc' }
            })
            for (const session of sessions.slice(0, Math.max(0, sessions.length - 4))) {
                await transaction.refreshToken.deleteMany({ where: { tokenId: session.tokenId } })
            }
            await transaction.refreshToken.create({
                data: {
                    ...this.sessionData(userId, issued, absoluteExpiresAt, user.tokenVersion),
                    sessionId: issued.tokenId
                }
            })
        })
        return issued.refreshToken
    }

    async validate(refreshToken: string) {
        const tokenId = this.tokens.extractTokenId(refreshToken)
        const session = await this.prisma.refreshToken.findUnique({ where: { tokenId } })
        if (!session) {
            const used = await this.prisma.usedRefreshToken.findUnique({ where: { tokenId } })
            if (used && this.tokens.matches(refreshToken, used.tokenHash)) {
                await this.prisma.$transaction(async transaction => {
                    await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${used.sessionId}, 2))`
                    await transaction.refreshToken.deleteMany({ where: { sessionId: used.sessionId } })
                })
            }
            throw new UnauthorizedException('Invalid refresh token!')
        }
        if (!this.tokens.matches(refreshToken, session.tokenHash))
            throw new UnauthorizedException('Invalid refresh token!')
        if (session.expiresAt <= new Date() || session.absoluteExpiresAt <= new Date()) {
            await this.prisma.refreshToken.deleteMany({ where: { tokenId } })
            throw new UnauthorizedException('Refresh token expired!')
        }
        return session
    }

    async rotate(session: RefreshToken): Promise<string> {
        const issued = this.tokens.generateRefreshToken()
        const rotated = await this.prisma.$transaction(async transaction => {
            // Serialize rotation and replay revocation for this device.
            await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${session.sessionId}, 2))`
            const consumed = await transaction.refreshToken.deleteMany({
                where: {
                    tokenId: session.tokenId,
                    tokenHash: session.tokenHash,
                    expiresAt: { gt: new Date() },
                    absoluteExpiresAt: { gt: new Date() }
                }
            })
            if (consumed.count !== 1) {
                await transaction.refreshToken.deleteMany({ where: { sessionId: session.sessionId } })
                return false
            }
            await transaction.usedRefreshToken.create({
                data: {
                    tokenId: session.tokenId,
                    tokenHash: session.tokenHash,
                    sessionId: session.sessionId,
                    expiresAt: session.absoluteExpiresAt
                }
            })
            await transaction.refreshToken.create({
                data: {
                    ...this.sessionData(session.userId, issued, session.absoluteExpiresAt, session.tokenVersion),
                    sessionId: session.sessionId,
                    createdAt: session.createdAt
                }
            })
            return true
        })
        if (!rotated) throw new UnauthorizedException('Refresh token already consumed; session revoked')
        return issued.refreshToken
    }

    async assertActive(userId: string, sessionId: string): Promise<void> {
        const session = await this.prisma.refreshToken.findUnique({ where: { sessionId } })
        if (
            !session ||
            session.userId !== userId ||
            session.expiresAt <= new Date() ||
            session.absoluteExpiresAt <= new Date()
        ) {
            throw new UnauthorizedException('Session revoked or expired')
        }
    }

    async revoke(refreshToken: string, userId?: string): Promise<void> {
        const tokenId = this.tokens.extractTokenId(refreshToken)
        const session = await this.prisma.refreshToken.findUnique({ where: { tokenId } })
        if (!session) return
        if (userId && session.userId !== userId) throw new UnauthorizedException('Invalid session')
        if (this.tokens.matches(refreshToken, session.tokenHash)) {
            await this.prisma.$transaction(async transaction => {
                await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${session.sessionId}, 2))`
                await transaction.refreshToken.deleteMany({ where: { sessionId: session.sessionId } })
            })
        }
    }

    async revokeAll(userId: string): Promise<void> {
        await this.prisma.$transaction([
            this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
            this.prisma.refreshToken.deleteMany({ where: { userId } })
        ])
    }

    private sessionData(
        userId: string,
        issued: { tokenId: string; refreshToken: string },
        absoluteExpiresAt: Date,
        tokenVersion: number
    ) {
        return {
            tokenId: issued.tokenId,
            tokenHash: this.tokens.hash(issued.refreshToken),
            userId,
            absoluteExpiresAt,
            tokenVersion,
            expiresAt: new Date(
                Math.min(Date.now() + this.config.getAuthConfig().jwt.refreshExpiresIn, absoluteExpiresAt.getTime())
            )
        }
    }
}
