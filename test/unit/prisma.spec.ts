import { ConfigService as NestConfigService } from '@nestjs/config'

import { LoggerService } from '@/common/logger/logger.service'
import { ConfigService } from '@/core/config/config.service'
import { PrismaService } from '@/core/prisma/prisma.service'

import { loggerMock } from '../helpers/fixtures'

// Mock the external Prisma client, not the application's PrismaService.
jest.mock('generated/prisma/client', () => ({
    PrismaClient: class {
        $connect = jest.fn().mockResolvedValue(undefined)
        $disconnect = jest.fn().mockResolvedValue(undefined)
    }
}))

describe('Prisma lifecycle adapter', () => {
    function createService() {
        return new PrismaService(
            new ConfigService(new NestConfigService({ database: { url: process.env.DATABASE_URL } })),
            loggerMock() as unknown as LoggerService
        )
    }

    it('connects on module initialization and disconnects on teardown', async () => {
        const service = createService()
        await service.onModuleInit()
        await service.onModuleDestroy()
        const lifecycle = service as unknown as {
            $connect: jest.Mock<Promise<void>, []>
            $disconnect: jest.Mock<Promise<void>, []>
        }
        expect(lifecycle.$connect).toHaveBeenCalledTimes(1)
        expect(lifecycle.$disconnect).toHaveBeenCalledTimes(1)
    })

    it('fails startup if the database cannot connect', async () => {
        const service = createService()
        ;(service.$connect as jest.Mock).mockRejectedValue(new Error('connection refused'))
        await expect(service.onModuleInit()).rejects.toThrow('connection refused')
    })

    it('propagates disconnect errors', async () => {
        const service = createService()
        ;(service.$disconnect as jest.Mock).mockRejectedValue(new Error('disconnect failed'))
        await expect(service.onModuleDestroy()).rejects.toThrow('disconnect failed')
    })
})
