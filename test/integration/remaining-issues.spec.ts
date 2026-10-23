import { NestFastifyApplication } from '@nestjs/platform-fastify'

import { PrismaService } from '@/core/prisma/prisma.service'
import { seedAdmin } from '@/core/security/admin-seed'
import { PasswordService } from '@/core/security/password.service'
import { PostgresThrottlerStorage } from '@/core/throttler/postgres-throttler.storage'

import { createApp } from '../helpers/app'
import { password, registration } from '../helpers/fixtures'
import { ApiEnvelope, SessionTokens, TestMethod } from '../helpers/http-types'
import { createPostgresDatabase } from '../helpers/postgres'

describe('Remaining production issues with PostgreSQL', () => {
    let database: Awaited<ReturnType<typeof createPostgresDatabase>>
    let harness: Awaited<ReturnType<typeof createApp>>
    let app: NestFastifyApplication
    beforeAll(async () => {
        database = await createPostgresDatabase()
    })
    beforeEach(async () => {
        await database.reset()
        harness = await createApp(database.db)
        app = harness.app
    })
    afterEach(async () => {
        await app?.close()
    })
    afterAll(async () => {
        await database?.close()
    })

    const request = (method: TestMethod, url: string, payload?: Record<string, unknown>, token?: string) =>
        app.inject({
            method,
            url: `/api/v1/${url}`,
            payload,
            headers: token ? { authorization: `Bearer ${token}` } : {}
        })
    function verificationToken() {
        const message = harness.mailer.sendMail.mock.calls.at(-1)?.[0]
        if (!message) throw new Error('Verification email was not sent')
        return (message.context as { otp: string }).otp
    }
    async function activeAccount() {
        const { password: clearPassword, ...data } = registration
        return database.db.user.create({
            data: { ...data, passwordHash: await new PasswordService().hash(clearPassword) }
        })
    }

    it('activates a registration through email and consumes the verification token once', async () => {
        expect((await request('POST', 'auth/register', registration)).statusCode).toBe(201)
        expect((await request('POST', 'auth/login', { username: 'alice', password })).statusCode).toBe(401)
        const token = verificationToken()
        expect(token).toMatch(/^[a-f0-9]{64}$/)
        expect((await request('POST', 'auth/verify-email', { token })).statusCode).toBe(200)
        expect((await request('POST', 'auth/verify-email', { token })).statusCode).toBe(401)
        expect((await request('POST', 'auth/login', { username: 'alice', password })).statusCode).toBe(200)
    })

    it('rejects expired verification and never activates a locked account', async () => {
        await request('POST', 'auth/register', registration)
        const token = verificationToken()
        const user = await database.db.user.findUniqueOrThrow({ where: { username: 'alice' } })
        await database.db.emailVerification.update({ where: { userId: user.id }, data: { expiresAt: new Date(0) } })
        expect((await request('POST', 'auth/verify-email', { token })).statusCode).toBe(401)
        await request('POST', 'auth/resend-verification', { email: registration.email })
        await database.db.user.update({ where: { id: user.id }, data: { status: 'LOCKED' } })
        expect((await request('POST', 'auth/verify-email', { token: verificationToken() })).statusCode).toBe(401)
    })

    it('resends pending verification without revealing whether an email exists', async () => {
        await request('POST', 'auth/register', registration)
        const original = verificationToken()
        expect((await request('POST', 'auth/resend-verification', { email: 'unknown@example.com' })).statusCode).toBe(
            200
        )
        expect(harness.mailer.sendMail).toHaveBeenCalledTimes(1)
        expect((await request('POST', 'auth/resend-verification', { email: registration.email })).statusCode).toBe(200)
        const replacement = verificationToken()
        expect(replacement).not.toBe(original)
        expect((await request('POST', 'auth/verify-email', { token: original })).statusCode).toBe(401)
        expect((await request('POST', 'auth/verify-email', { token: replacement })).statusCode).toBe(200)
    })

    it('allows retrying delivery when SMTP fails after account creation', async () => {
        harness.mailer.sendMail.mockRejectedValueOnce(new Error('SMTP unavailable'))
        expect((await request('POST', 'auth/register', registration)).statusCode).toBe(503)
        expect((await request('POST', 'auth/resend-verification', { email: registration.email })).statusCode).toBe(200)
        expect((await request('POST', 'auth/verify-email', { token: verificationToken() })).statusCode).toBe(200)
    })

    it('consumes verification atomically under concurrent requests', async () => {
        await request('POST', 'auth/register', registration)
        const token = verificationToken()
        const responses = await Promise.all([
            request('POST', 'auth/verify-email', { token }),
            request('POST', 'auth/verify-email', { token })
        ])
        expect(responses.map(response => response.statusCode).sort()).toEqual([200, 401])
    })

    it('revokes access and refresh tokens immediately after a password change', async () => {
        await activeAccount()
        const session = (await request('POST', 'auth/login', { username: 'alice', password })).json<
            ApiEnvelope<SessionTokens>
        >().data
        expect(
            (
                await request(
                    'POST',
                    'auth/change-password',
                    { currentPassword: password, newPassword: 'ChangedPassword456!' },
                    session.accessToken
                )
            ).statusCode
        ).toBe(200)
        expect((await request('GET', 'users/me', undefined, session.accessToken)).statusCode).toBe(401)
        expect((await request('POST', 'auth/refresh', { refreshToken: session.refreshToken })).statusCode).toBe(401)
        const fresh = (
            await request('POST', 'auth/login', { username: 'alice', password: 'ChangedPassword456!' })
        ).json<ApiEnvelope<SessionTokens>>().data
        expect((await request('GET', 'users/me', undefined, fresh.accessToken)).statusCode).toBe(200)
    })

    it('shares the rate limit across independently constructed storage instances', async () => {
        const first = new PostgresThrottlerStorage(database.db as unknown as PrismaService)
        const second = new PostgresThrottlerStorage(database.db as unknown as PrismaService)
        expect((await first.increment('client', 60000, 2, 60000, 'default')).isBlocked).toBe(false)
        expect((await second.increment('client', 60000, 2, 60000, 'default')).totalHits).toBe(2)
        expect((await first.increment('client', 60000, 2, 60000, 'default')).isBlocked).toBe(true)
        expect((await second.increment('client', 60000, 2, 60000, 'default')).isBlocked).toBe(true)
        const concurrent = await Promise.all(
            Array.from({ length: 10 }, (_, index) =>
                (index % 2 ? first : second).increment('concurrent', 60000, 5, 60000, 'default')
            )
        )
        expect(concurrent.filter(result => !result.isBlocked)).toHaveLength(5)
        expect(await database.db.rateLimit.findUnique({ where: { key: 'default:concurrent' } })).toMatchObject({
            hits: 6
        })
        await database.db.rateLimit.update({
            where: { key: 'default:client' },
            data: { expiresAt: new Date(0), blockedUntil: new Date(0) }
        })
        expect(await second.increment('client', 60000, 2, 60000, 'default')).toMatchObject({
            totalHits: 1,
            isBlocked: false
        })
    })

    it('enforces the HTTP limit across two API replicas', async () => {
        const first = await createApp(database.db, true)
        const second = await createApp(database.db, true)
        try {
            for (let index = 0; index < 5; index++) {
                expect((await first.app.inject({ method: 'GET', url: '/api/v1/health/detailed' })).statusCode).toBe(200)
            }
            expect((await second.app.inject({ method: 'GET', url: '/api/v1/health/detailed' })).statusCode).toBe(429)
        } finally {
            await first.app.close()
            await second.app.close()
        }
    })

    it('seeds admin securely and is idempotent until configured credentials change', async () => {
        await expect(seedAdmin(database.db, {})).rejects.toThrow('SEED_ADMIN_PASSWORD')
        const environment = { SEED_ADMIN_EMAIL: 'admin@example.com', SEED_ADMIN_PASSWORD: 'SecureAdminPassword123!' }
        await seedAdmin(database.db, environment)
        const original = await database.db.user.findUniqueOrThrow({ where: { username: 'admin' } })
        await seedAdmin(database.db, environment)
        expect((await database.db.user.findUniqueOrThrow({ where: { username: 'admin' } })).passwordHash).toBe(
            original.passwordHash
        )
        await seedAdmin(database.db, { ...environment, SEED_ADMIN_PASSWORD: 'ChangedAdminPassword456!' })
        expect((await database.db.user.findUniqueOrThrow({ where: { username: 'admin' } })).tokenVersion).toBe(1)
    })
})
