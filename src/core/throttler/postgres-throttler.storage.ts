import type { ThrottlerStorage } from '@nestjs/throttler'

import { PrismaService } from '../prisma/prisma.service'

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>

export class PostgresThrottlerStorage implements ThrottlerStorage {
    private lastCleanup = 0

    constructor(private readonly prisma: PrismaService) {}

    async increment(
        key: string,
        ttl: number,
        limit: number,
        blockDuration: number,
        throttlerName: string
    ): Promise<ThrottlerStorageRecord> {
        const now = new Date()
        if (now.getTime() - this.lastCleanup >= 60000) {
            this.lastCleanup = now.getTime()
            await this.prisma.rateLimit.deleteMany({
                where: {
                    expiresAt: { lte: now },
                    OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }]
                }
            })
        }
        const bucketKey = `${throttlerName}:${key}`
        return this.prisma.$transaction(async transaction => {
            await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${bucketKey}, 1))`
            const current = await transaction.rateLimit.findUnique({ where: { key: bucketKey } })
            if (current?.blockedUntil && current.blockedUntil > now)
                return {
                    totalHits: current.hits,
                    isBlocked: true,
                    timeToExpire: Math.max(0, Math.ceil((current.expiresAt.getTime() - now.getTime()) / 1000)),
                    timeToBlockExpire: Math.ceil((current.blockedUntil.getTime() - now.getTime()) / 1000)
                }
            const reset = !current || current.expiresAt <= now || current.blockedUntil !== null
            const hits = reset ? 1 : current.hits + 1
            const expiresAt = reset ? new Date(now.getTime() + ttl) : current.expiresAt
            const blockedUntil = hits > limit ? new Date(now.getTime() + blockDuration) : null
            await transaction.rateLimit.upsert({
                where: { key: bucketKey },
                create: { key: bucketKey, hits, expiresAt, blockedUntil },
                update: { hits, expiresAt, blockedUntil }
            })
            return {
                totalHits: hits,
                isBlocked: blockedUntil !== null,
                timeToExpire: Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
                timeToBlockExpire: blockedUntil ? Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000) : 0
            }
        })
    }
}
