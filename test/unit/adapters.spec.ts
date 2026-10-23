import { v2 as cloudinary } from 'cloudinary'
import { Readable, Writable } from 'stream'

import { LoggerService } from '@/common/logger/logger.service'
import { ConfigService } from '@/core/config/config.service'
import { MailTransport } from '@/core/mail/mail-transport.service'
import { MailService } from '@/core/mail/mail.service'
import { CloudinaryService } from '@/core/storage/cloudinary.service'

import { loggerMock } from '../helpers/fixtures'

describe('Mail adapter', () => {
    it('delivers the requested message to the mail provider', async () => {
        const provider = { sendMail: jest.fn().mockResolvedValue({ messageId: 'one' }) }
        const logs = loggerMock()
        const service = new MailService(provider as unknown as MailTransport, logs as unknown as LoggerService)
        const message = { to: 'alice@example.com', subject: 'Hello', text: 'Welcome' }
        await service.sendMail(message)
        expect(provider.sendMail).toHaveBeenCalledWith(message)
        expect(logs.log).toHaveBeenCalledWith('Email sent successfully')
    })

    it('reports a provider failure in the error log', async () => {
        const error = new Error('smtp unavailable')
        const provider = { sendMail: jest.fn().mockRejectedValue(error) }
        const logs = loggerMock()
        await expect(
            new MailService(provider as unknown as MailTransport, logs as unknown as LoggerService).sendMail({
                to: 'alice@example.com',
                subject: 'Hello'
            })
        ).rejects.toBe(error)
        expect(logs.error).toHaveBeenCalledWith('Failed to send email', error.stack)
    })

    it('addresses verification mail with the supplied OTP and name', async () => {
        const provider = { sendMail: jest.fn().mockResolvedValue({}) }
        const service = new MailService(provider as unknown as MailTransport, loggerMock() as unknown as LoggerService)
        await service.sendVerifyEmail('alice@example.com', 'Alice', '123456')
        expect(provider.sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: 'alice@example.com',
                subject: 'Verify Your Email',
                context: { name: 'Alice', otp: '123456' }
            })
        )
    })
})

describe('Cloudinary adapter', () => {
    let service: CloudinaryService
    beforeEach(() => {
        const config = {
            getCloudinaryConfig: () => ({
                cloudName: 'test',
                apiKey: 'test',
                apiSecret: 'test',
                folder: 'avatars',
                publicIdPrefix: 'user_'
            })
        }
        service = new CloudinaryService(config as ConfigService)
    })
    afterEach(() => jest.restoreAllMocks())

    it('streams the original file bytes to the configured user-specific asset', async () => {
        const chunks: Buffer[] = []
        const result = { secure_url: 'https://example.com/avatar.png' }
        const upload = jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
            ((options: unknown, callback: (error: Error | null, result?: { secure_url: string }) => void) =>
                new Writable({
                    write(chunk: Buffer, _encoding, done) {
                        chunks.push(chunk)
                        done()
                    },
                    final(done) {
                        callback(null, result)
                        done()
                    }
                })) as unknown as typeof cloudinary.uploader.upload_stream
        )
        expect(await service.uploadImage('alice', Readable.from(Buffer.from('original image bytes')))).toEqual(result)
        expect(Buffer.concat(chunks).toString()).toBe('original image bytes')
        expect(upload.mock.calls[0][0]).toMatchObject({
            folder: 'avatars',
            public_id: 'user_alice',
            resource_type: 'image',
            overwrite: true
        })
    })

    it('propagates an image-provider error', async () => {
        jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(
            ((options: unknown, callback: (error: Error | null, result?: { secure_url: string }) => void) =>
                new Writable({
                    write(_chunk, _encoding, done) {
                        done()
                    },
                    final(done) {
                        callback(new Error('invalid image'))
                        done()
                    }
                })) as unknown as typeof cloudinary.uploader.upload_stream
        )
        await expect(service.uploadImage('alice', Readable.from('bad image'))).rejects.toThrow('invalid image')
    })
})
