import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler'

import { AppModule } from '@/app.module'
import { LoggerService } from '@/common/logger/logger.service'
import { configureApp } from '@/configure-app'
import { MailMessage, MailTransport } from '@/core/mail/mail-transport.service'
import { PrismaService } from '@/core/prisma/prisma.service'

import { loggerMock } from './fixtures'

export async function createApp(database: unknown, sharedRateLimit = false) {
    const logs = loggerMock()
    const mailer = { sendMail: jest.fn<Promise<unknown>, [MailMessage]>().mockResolvedValue({}) }
    const builder = Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(MailTransport)
        .useValue(mailer)
        .overrideProvider(PrismaService)
        .useValue(database)
        .overrideProvider(LoggerService)
        .useValue(logs)
    if (!sharedRateLimit) builder.overrideProvider(ThrottlerStorage).useValue(new ThrottlerStorageService())
    const module = await builder.compile()
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false })
    await configureApp(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    return { app, logs, mailer }
}
