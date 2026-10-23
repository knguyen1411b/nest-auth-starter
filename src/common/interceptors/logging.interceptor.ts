import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'

import { LoggerService } from '@/common/logger/logger.service'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    constructor(@Inject(LoggerService) private readonly logger: LoggerService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest<FastifyRequest>()
        const started = Date.now()
        // Log request metadata only: bodies and responses can contain credentials.
        this.logger.log(`Request [${request.id}]: ${request.method} ${request.url.split('?')[0]} - ${request.ip}`)
        return next.handle().pipe(
            tap({
                next: () =>
                    this.logger.log(
                        `Response [${request.id}]: ${request.method} ${request.url.split('?')[0]} - ${Date.now() - started}ms`
                    ),
                error: (error: unknown) =>
                    this.logger.error(
                        `Response Error [${request.id}]: ${request.method} ${request.url.split('?')[0]} - ${Date.now() - started}ms`,
                        error instanceof Error ? error.stack : 'Unknown request error'
                    )
            })
        )
    }
}
