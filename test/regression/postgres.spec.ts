import { NestFastifyApplication } from '@nestjs/platform-fastify'

import { PasswordService } from '@/core/security/password.service'
import { AuthService } from '@/modules/auth/auth.service'

import { createApp } from '../helpers/app'
import { password, registration } from '../helpers/fixtures'
import { ApiEnvelope, SessionTokens, UserProfile } from '../helpers/http-types'
import { TestMethod } from '../helpers/http-types'
import { createPostgresDatabase } from '../helpers/postgres'

describe('Known regressions against PostgreSQL', () => {
    let database: Awaited<ReturnType<typeof createPostgresDatabase>>
    let app: NestFastifyApplication
    let adminToken: string
    beforeAll(async () => {
        database = await createPostgresDatabase()
    })
    beforeEach(async () => {
        await database.reset()
        ;({ app } = await createApp(database.db))
        const admin = await database.db.user.create({
            data: {
                username: 'administrator',
                email: 'admin@example.com',
                role: 'ADMIN',
                passwordHash: await new PasswordService().hash(password)
            }
        })
        adminToken = (await app.get(AuthService).login(admin.id)).accessToken
    })
    afterEach(async () => {
        await app?.close()
    })
    afterAll(async () => {
        await database?.close()
    })

    const request = (method: TestMethod, url: string, payload?: Record<string, unknown>, token = adminToken) =>
        app.inject({
            method,
            url: `/api/v1/${url}`,
            payload,
            headers: { authorization: `Bearer ${token}` }
        })
    async function session() {
        await request('POST', 'users', { ...registration, role: 'USER' })
        return (await request('POST', 'auth/login', { username: 'alice', password })).json<ApiEnvelope<SessionTokens>>()
            .data
    }

    it('excludes password hashes from user lists', async () => {
        const response = await request('GET', 'users')
        expect(response.statusCode).toBe(200)
        expect(response.json<ApiEnvelope<UserProfile[]>>().data[0]).not.toHaveProperty('passwordHash')
    })

    it('excludes soft-deleted accounts from user lists', async () => {
        const issued = await session()
        const id = (await request('GET', 'users/me', undefined, issued.accessToken)).json<ApiEnvelope<UserProfile>>()
            .data.id
        await request('DELETE', `users/${id}`)
        const response = await request('GET', 'users')
        expect(response.json<ApiEnvelope<UserProfile[]>>().data.map(item => item.id)).not.toContain(id)
    })

    it('accepts numeric pagination query strings', async () => {
        expect((await request('GET', 'users?page=1&limit=10')).statusCode).toBe(200)
    })

    it('filters users by the documented search query', async () => {
        await session()
        const response = await request('GET', 'users?q=alice')
        expect(response.statusCode).toBe(200)
        expect(response.json<ApiEnvelope<UserProfile[]>>().data.map(item => item.username)).toEqual(['alice'])
    })

    it.each(['order=invalid', 'sort=notAField'])('rejects invalid sorting as a client error (%s)', async query => {
        expect((await request('GET', `users?${query}`)).statusCode).toBe(400)
    })

    it('revokes refresh credentials when a password changes', async () => {
        const issued = await session()
        await request(
            'POST',
            'auth/change-password',
            { currentPassword: password, newPassword: 'ChangedPassword456!' },
            issued.accessToken
        )
        expect((await request('POST', 'auth/refresh', { refreshToken: issued.refreshToken })).statusCode).toBe(401)
    })

    it('rejects refresh after the account is locked', async () => {
        const issued = await session()
        const id = (await request('GET', 'users/me', undefined, issued.accessToken)).json<ApiEnvelope<UserProfile>>()
            .data.id
        await request('PATCH', `users/${id}`, { status: 'LOCKED' })
        expect((await request('POST', 'auth/refresh', { refreshToken: issued.refreshToken })).statusCode).toBe(401)
    })

    it('consumes a refresh token atomically under concurrent requests', async () => {
        const issued = await session()
        const responses = await Promise.all([
            request('POST', 'auth/refresh', { refreshToken: issued.refreshToken }),
            request('POST', 'auth/refresh', { refreshToken: issued.refreshToken })
        ])
        expect(responses.map(response => response.statusCode).sort()).toEqual([200, 401])
    })
})
