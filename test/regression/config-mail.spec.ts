import { LoggerService } from '@/common/logger/logger.service'
import defaultConfig from '@/core/config/envs/default'
import developmentConfig from '@/core/config/envs/development'
import productionConfig from '@/core/config/envs/production'
import { MailMessage, MailTransport, renderMail } from '@/core/mail/mail-transport.service'
import { MailService } from '@/core/mail/mail.service'

import { loggerMock } from '../helpers/fixtures'

describe('Known configuration and email regressions', () => {
    const oldExpiry = process.env.JWT_REFRESH_EXPIRES_IN
    afterEach(() => {
        process.env.JWT_REFRESH_EXPIRES_IN = oldExpiry
    })

    it.each([
        ['default', defaultConfig],
        ['development', developmentConfig],
        ['production', productionConfig]
    ] as const)('interprets the example seven-day refresh expiry in %s configuration', (_name, factory) => {
        // .env.example documents 604800 seconds; expiresAt is calculated in ms.
        process.env.JWT_REFRESH_EXPIRES_IN = '604800'
        expect(factory().auth.jwt.refreshExpiresIn).toBe(604800000)
    })

    it('renders the verification email template selected by MailService', async () => {
        const provider = { sendMail: jest.fn<Promise<unknown>, [MailMessage]>().mockResolvedValue({}) }
        await new MailService(
            provider as unknown as MailTransport,
            loggerMock() as unknown as LoggerService
        ).sendVerifyEmail('alice@example.com', 'Alice', '123456')
        const message = provider.sendMail.mock.calls[0][0]
        const rendered = renderMail(message)
        expect(rendered.html).toContain('123456')
    })
})
