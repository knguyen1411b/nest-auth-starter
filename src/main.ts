import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'

import { AppModule } from './app.module'
import { LoggerService } from './common/logger/logger.service'
import { configureApp } from './configure-app'
import { ConfigService } from './core/config/config.service'

async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({
            trustProxy: process.env.TRUST_PROXY ? process.env.TRUST_PROXY.split(',').map(value => value.trim()) : false
        }),
        { bufferLogs: true }
    )
    const logger = app.get(LoggerService)
    app.useLogger(logger)
    await configureApp(app)
    const { port, host } = app.get(ConfigService).getAppConfig()
    await app.listen(port, host)
    logger.log(`Application is running on: ${await app.getUrl()}`)
}

bootstrap().catch((error: unknown) => {
    new Logger('Bootstrap').error('Failed to start application', error instanceof Error ? error.stack : error)
    process.exit(1)
})
