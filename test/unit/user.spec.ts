import { NotFoundException } from '@nestjs/common'
import { v2 as cloudinary } from 'cloudinary'
import { Readable, Writable } from 'stream'

import { ConfigService } from '@/core/config/config.service'
import { PrismaService } from '@/core/prisma/prisma.service'
import { PasswordService } from '@/core/security/password.service'
import { CloudinaryService } from '@/core/storage/cloudinary.service'
import { UserQueryDto } from '@/modules/user/dto/user-query.dto'
import { UserRole } from '@/modules/user/dto/user.dto'
import { UserService } from '@/modules/user/user.service'

import { databaseMock, password, registration, user } from '../helpers/fixtures'

describe('User service', () => {
    let db: ReturnType<typeof databaseMock>
    let service: UserService
    const passwords = new PasswordService()
    const actor = user({ role: 'ADMIN' })

    beforeEach(() => {
        db = databaseMock()
        const config = {
            getCloudinaryConfig: () => ({
                cloudName: 'test',
                apiKey: 'test',
                apiSecret: 'test',
                folder: 'avatars',
                publicIdPrefix: 'user_'
            })
        }
        service = new UserService(
            db as unknown as PrismaService,
            new CloudinaryService(config as ConfigService),
            passwords
        )
    })

    afterEach(() => jest.restoreAllMocks())

    it('creates a user with a hashed password', async () => {
        await service.create({ ...registration, role: UserRole.USER }, actor)
        const stored = db.user.create.mock.calls[0][0].data
        expect(stored).not.toHaveProperty('password')
        expect(await passwords.compare(password, stored.passwordHash)).toBe(true)
    })

    it('exposes a safe current-user profile', () => {
        const profile = service.getMe(user())
        expect(profile).toMatchObject({ username: 'alice', email: 'alice@example.com', role: 'USER' })
        expect(profile).not.toHaveProperty('passwordHash')
    })

    it('returns the public details of an existing user', async () => {
        db.user.findFirst.mockResolvedValue({ id: user().id, username: 'alice' })
        expect(await service.findOne(user().id)).toEqual({ id: user().id, username: 'alice' })
    })

    it('rejects an unknown or soft-deleted user', async () => {
        db.user.findFirst.mockResolvedValue(null)
        await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('updates a profile without overwriting its password', async () => {
        db.user.findFirst.mockResolvedValue(user())
        await service.update(user().id, { fullName: 'Alice Updated' }, actor)
        expect(db.user.update.mock.calls[0][0].data).toEqual({ fullName: 'Alice Updated' })
    })

    it('hashes a replacement password', async () => {
        db.user.findFirst.mockResolvedValue(user())
        await service.update(user().id, { password: 'NewPassword456!' }, actor)
        const data = db.user.update.mock.calls[0][0].data
        expect(data).not.toHaveProperty('password')
        expect(await passwords.compare('NewPassword456!', data.passwordHash!)).toBe(true)
    })

    it.each(['update', 'remove'] as const)('does not %s an unknown user', async method => {
        db.user.findFirst.mockResolvedValue(null)
        await expect(
            method === 'update' ? service.update('missing', {}, actor) : service.remove('missing', actor)
        ).rejects.toBeInstanceOf(NotFoundException)
        expect(db.user.update).not.toHaveBeenCalled()
    })

    it('soft-deletes rather than physically removing an account', async () => {
        db.user.findFirst.mockResolvedValue(user())
        await service.remove(user().id, actor)
        expect(db.user.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date)
        expect(db.user.delete).not.toHaveBeenCalled()
    })

    it('returns page data and pagination metadata', async () => {
        db.user.findMany.mockResolvedValue([{ id: 'third' }])
        db.user.count.mockResolvedValue(3)
        expect(await service.findAll({ ...new UserQueryDto(), page: 2, limit: 2 })).toEqual({
            data: [{ id: 'third' }],
            meta: { total: 3, page: 2, limit: 2, pages: 2 }
        })
    })

    it('persists the URL returned by the image provider', async () => {
        jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
            ((options: unknown, callback: (error: Error | null, result?: { secure_url: string }) => void) =>
                new Writable({
                    write(_chunk, _encoding, done) {
                        done()
                    },
                    final(done) {
                        callback(null, { secure_url: 'https://example.com/avatar.png' })
                        done()
                    }
                })) as unknown as typeof cloudinary.uploader.upload_stream
        )
        await service.uploadAvatar(user().id, Readable.from(Buffer.from('image')))
        expect(db.user.update.mock.calls[0][0].data).toEqual({ avatarUrl: 'https://example.com/avatar.png' })
    })

    it('does not change the avatar when the image provider rejects the upload', async () => {
        jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
            ((options: unknown, callback: (error: Error | null, result?: { secure_url: string }) => void) =>
                new Writable({
                    write(_chunk, _encoding, done) {
                        done()
                    },
                    final(done) {
                        callback(new Error('upload failed'))
                        done()
                    }
                })) as unknown as typeof cloudinary.uploader.upload_stream
        )
        await expect(service.uploadAvatar(user().id, Readable.from('image'))).rejects.toThrow('upload failed')
        expect(db.user.update).not.toHaveBeenCalled()
    })
})
