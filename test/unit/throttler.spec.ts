import { Controller, Get } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { ThrottlerModule } from '@nestjs/throttler'

import { ThrottlerGuard } from '@/core/throttler/throttler.guard'

@Controller('limited')
class LimitedController {
    @Get() read() {
        return { ok: true }
    }
}

describe('Custom throttler guard when registered', () => {
    let app: NestFastifyApplication
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1 }])],
            controllers: [LimitedController],
            providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
        }).compile()
        app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false })
        await app.init()
        await app.getHttpAdapter().getInstance().ready()
    })
    afterAll(async () => {
        await app?.close()
    })

    it('allows the first request and returns the custom 429 error when exceeded', async () => {
        expect((await app.inject({ method: 'GET', url: '/limited' })).statusCode).toBe(200)
        const denied = await app.inject({ method: 'GET', url: '/limited' })
        expect(denied.statusCode).toBe(429)
        expect(denied.json()).toMatchObject({
            statusCode: 429,
            errors: 'Too Many Requests',
            message: 'You have exceeded the allowed number of requests. Please try again later.'
        })
    })
})
