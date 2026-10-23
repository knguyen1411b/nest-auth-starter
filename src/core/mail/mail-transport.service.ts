import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { readFileSync } from 'fs'
import Handlebars from 'handlebars'
import { SendMailOptions, Transporter, createTransport } from 'nodemailer'
import { join } from 'path'

import { ConfigService } from '../config/config.service'

export type MailMessage = SendMailOptions & {
    template?: 'verify-email' | 'reset-password'
    context?: Record<string, string>
}

export function renderMail(message: MailMessage): SendMailOptions {
    const { template, context, ...options } = message
    if (!template) return options
    // Template names come from application code, never from request input.
    const source = readFileSync(join(__dirname, 'templates', `${template}.hbs`), 'utf8')
    return { ...options, html: Handlebars.compile(source, { strict: true })(context) }
}

@Injectable()
export class MailTransport implements OnModuleDestroy {
    private readonly transport: Transporter

    constructor(config: ConfigService) {
        const { host, port, secure, from, user, pass } = config.getMailConfig()
        this.transport = createTransport(
            {
                host,
                port,
                secure,
                connectionTimeout: 10000,
                socketTimeout: 10000,
                ...(user ? { auth: { user, pass } } : {})
            },
            { from }
        )
    }

    sendMail(message: MailMessage): Promise<unknown> {
        return this.transport.sendMail(renderMail(message))
    }

    onModuleDestroy(): void {
        this.transport.close()
    }
}
