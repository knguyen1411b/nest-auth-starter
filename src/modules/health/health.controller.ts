import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SkipThrottle, Throttle } from '@nestjs/throttler'

import { Public } from '@/common/decorators/public.decorator'

import { HealthService } from './health.service'

@ApiTags('Health')
@Controller()
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    @Public()
    @Get('health')
    @SkipThrottle()
    health() {
        return this.healthService.healthCheck()
    }

    @Public()
    @Get('health/ready')
    @SkipThrottle()
    readiness() {
        return this.healthService.readiness()
    }

    @Public()
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Get('health/detailed')
    detailedHealth() {
        return this.healthService.detailedHealthCheck()
    }
}
