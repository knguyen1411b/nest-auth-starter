import { Injectable } from '@nestjs/common'

import { LoggerService } from '@/common/logger/logger.service'

import { MailMessage, MailTransport } from './mail-transport.service'

@Injectable()
export class MailService {
    constructor(
        private readonly mailer: MailTransport,
        private readonly logger: LoggerService
    ) {}

    async sendMail(payload: MailMessage): Promise<void> {
        try {
            await this.mailer.sendMail(payload)
            this.logger.log('Email sent successfully')
        } catch (error: unknown) {
            this.logger.error('Failed to send email', error instanceof Error ? error.stack : 'Unknown mail error')
            throw error
        }
    }

    sendPasswordReset(to: string, name: string, token: string) {
        return this.sendMail({
            to,
            subject: 'Reset Your Password',
            template: 'reset-password',
            context: { name, token }
        })
    }

    sendVerifyEmail(to: string, name: string, otp: string) {
        return this.sendMail({
            to,
            subject: 'Verify Your Email',
            template: 'verify-email',
            context: { name, otp }
        })
    }
}
