import { HttpException, HttpStatus } from '@nestjs/common'
import { ThrottlerGuard as NestThrottlerGuard } from '@nestjs/throttler'

export class ThrottlerGuard extends NestThrottlerGuard {
    protected throwThrottlingException(): Promise<void> {
        throw new HttpException(
            {
                statusCode: HttpStatus.TOO_MANY_REQUESTS,
                message: 'You have exceeded the allowed number of requests. Please try again later.',
                errors: 'Too Many Requests'
            },
            HttpStatus.TOO_MANY_REQUESTS
        )
    }
}
