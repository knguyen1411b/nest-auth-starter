import { ConflictException, UnauthorizedException } from '@nestjs/common'

import { databaseMock, password, registration, user } from '../helpers/fixtures'
import { AccessClaims } from '../helpers/http-types'
import { authServices } from '../helpers/services'

describe('Auth service', () => {
    let db: ReturnType<typeof databaseMock>
    let services: ReturnType<typeof authServices>
    let account: ReturnType<typeof user>

    beforeEach(async () => {
        db = databaseMock()
        services = authServices(db)
        account = user({ passwordHash: await services.passwords.hash(password) })
        db.user.findUnique.mockResolvedValue(account)
        db.user.create.mockImplementation(({ data }) => Promise.resolve({ ...account, ...data }))
        db.refreshToken.deleteMany.mockResolvedValue({ count: 1 })
    })

    it('registers an ordinary account without storing the plaintext password', async () => {
        await services.auth.register(registration)
        const stored = db.user.create.mock.calls[0][0].data
        expect(stored).toMatchObject({ username: 'alice', email: 'alice@example.com', role: 'USER' })
        expect(stored).not.toHaveProperty('password')
        expect(await services.passwords.compare(password, stored.passwordHash)).toBe(true)
    })

    it.each(['username', 'email'])('rejects registration when %s is already used', async () => {
        db.user.findFirst.mockResolvedValue(account)
        await expect(services.auth.register(registration)).rejects.toBeInstanceOf(ConflictException)
        expect(db.user.create).not.toHaveBeenCalled()
    })

    it('accepts valid login credentials', async () => {
        expect(await services.auth.validateLocalUser('alice', password)).toMatchObject({ id: account.id })
    })

    it('rejects an unknown username', async () => {
        db.user.findUnique.mockResolvedValue(null)
        await expect(services.auth.validateLocalUser('missing', password)).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('rejects an incorrect password', async () => {
        await expect(services.auth.validateLocalUser('alice', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('issues verifiable access and refresh tokens', async () => {
        const issued = await services.auth.login(account.id)
        expect(services.jwt.verify<AccessClaims>(issued.accessToken, { secret: process.env.JWT_SECRET }).sub).toBe(
            account.id
        )
        const stored = db.refreshToken.create.mock.calls[0][0].data
        expect(stored.tokenHash).not.toBe(issued.refreshToken)
        expect(services.tokens.matches(issued.refreshToken, stored.tokenHash)).toBe(true)
        expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(604790000)
    })

    it('evicts the oldest session when the five-session limit is reached', async () => {
        db.refreshToken.findMany.mockResolvedValue([
            { tokenId: 'oldest' },
            { tokenId: 'second' },
            { tokenId: 'third' },
            { tokenId: 'fourth' },
            { tokenId: 'fifth' }
        ])
        await services.auth.login(account.id)
        expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { tokenId: 'oldest' } })
    })

    it('rejects an unknown JWT user', async () => {
        db.user.findUnique.mockResolvedValue(null)
        await expect(services.auth.validateJwtUser('missing')).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('resolves the identity of an existing JWT user', async () => {
        expect(await services.auth.validateJwtUser(account.id)).toMatchObject({ id: account.id })
    })

    it('changes the password and no longer accepts the old password', async () => {
        db.user.update.mockImplementation(({ data }) => Object.assign(account, data))
        await services.auth.changePassword(account.id, { currentPassword: password, newPassword: 'NewPassword456!' })
        await expect(services.auth.validateLocalUser('alice', password)).rejects.toBeInstanceOf(UnauthorizedException)
        expect(await services.auth.validateLocalUser('alice', 'NewPassword456!')).toMatchObject({ id: account.id })
    })

    it('rejects a password change with an incorrect current password', async () => {
        await expect(
            services.auth.changePassword(account.id, { currentPassword: 'wrong', newPassword: 'NewPassword456!' })
        ).rejects.toBeInstanceOf(UnauthorizedException)
        expect(db.user.update).not.toHaveBeenCalled()
    })

    it('rejects a password change for a missing account', async () => {
        db.user.findUnique.mockResolvedValue(null)
        await expect(
            services.auth.changePassword('missing', { currentPassword: password, newPassword: 'NewPassword456!' })
        ).rejects.toBeInstanceOf(UnauthorizedException)
    })

    function session(expiresAt = new Date(Date.now() + 60000)) {
        const issued = services.tokens.generateRefreshToken()
        const stored = {
            tokenId: issued.tokenId,
            tokenHash: services.tokens.hash(issued.refreshToken),
            userId: account.id,
            sessionId: issued.tokenId,
            tokenVersion: account.tokenVersion,
            absoluteExpiresAt: new Date(Date.now() + 2592000000),
            createdAt: new Date(),
            expiresAt
        }
        db.refreshToken.findUnique.mockResolvedValue(stored)
        return Promise.resolve(issued.refreshToken)
    }

    it('rotates a valid refresh token and rejects reuse of the consumed token', async () => {
        const old = await session()
        db.refreshToken.deleteMany.mockImplementation(() => {
            db.refreshToken.findUnique.mockResolvedValue(null)
            return Promise.resolve({ count: 1 })
        })
        const issued = await services.auth.refresh(old)
        expect(issued.refreshToken).not.toBe(old)
        expect(services.jwt.verify<AccessClaims>(issued.accessToken, { secret: process.env.JWT_SECRET }).sub).toBe(
            account.id
        )
        await expect(services.auth.refresh(old)).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('rejects an unknown refresh token', async () => {
        db.refreshToken.findUnique.mockResolvedValue(null)
        await expect(services.auth.refresh('unknown.secret')).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('rejects an expired refresh token', async () => {
        const token = await session(new Date(Date.now() - 1000))
        await expect(services.auth.refresh(token)).rejects.toThrow('Refresh token expired')
        expect(db.refreshToken.create).not.toHaveBeenCalled()
    })

    it('rejects a refresh token with a different secret', async () => {
        const token = await session()
        await expect(services.auth.refresh(token.split('.')[0] + '.wrong')).rejects.toBeInstanceOf(
            UnauthorizedException
        )
    })

    it('rejects refresh for a missing user', async () => {
        const token = await session()
        db.user.findUnique.mockResolvedValue(null)
        await expect(services.auth.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException)
    })

    it('revokes a matching session on logout', async () => {
        const token = await session()
        await services.auth.logout(token)
        expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
            where: { sessionId: token.split('.')[0] }
        })
    })

    it('treats logout of an unknown token as idempotent', async () => {
        db.refreshToken.findUnique.mockResolvedValue(null)
        await expect(services.auth.logout(services.tokens.generateRefreshToken().refreshToken)).resolves.toBeUndefined()
    })

    it('does not revoke a session when the supplied secret is wrong', async () => {
        const token = await session()
        const original = token.split('.')[1]
        const changed = original[0] === '0' ? '1' : '0'
        await services.auth.logout(token.split('.')[0] + '.' + changed + original.slice(1))
        expect(db.refreshToken.deleteMany).not.toHaveBeenCalled()
    })

    it('cleans up an expired session on logout', async () => {
        const token = await session(new Date(Date.now() - 1000))
        await services.auth.logout(token)
        expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
            where: { sessionId: token.split('.')[0] }
        })
    })

    it('revokes all refresh sessions belonging to the user', async () => {
        await services.auth.logoutAll(account.id)
        expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: account.id } })
    })

    it('propagates database failures rather than reporting successful registration', async () => {
        db.user.create.mockRejectedValue(new Error('database unavailable'))
        await expect(services.auth.register(registration)).rejects.toThrow('database unavailable')
    })
})
