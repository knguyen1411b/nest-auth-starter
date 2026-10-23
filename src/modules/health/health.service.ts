import { Injectable, ServiceUnavailableException } from '@nestjs/common'

import { PrismaService } from '@/core/prisma/prisma.service'

@Injectable()
export class HealthService {
    constructor(private readonly prisma: PrismaService) {}

    async readiness() {
        try {
            await this.prisma.$queryRaw`SELECT 1`
            return { status: 'ready' }
        } catch {
            throw new ServiceUnavailableException('Database unavailable')
        }
    }
    healthCheck() {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        }
    }

    detailedHealthCheck() {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
            memory: {
                used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
                total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
                unit: 'MB'
            },
            cpu: {
                usage: process.cpuUsage()
            }
        }
    }
}
