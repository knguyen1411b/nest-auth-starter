import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Inject } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { LoggerService } from '../logger/logger.service'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    constructor(@Inject(LoggerService) private readonly loggerService: LoggerService) {}

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp()
        const reply = ctx.getResponse<FastifyReply>()
        const request = ctx.getRequest<FastifyRequest>()

        const fastifyError = exception as { code?: unknown; statusCode?: unknown } | null
        const clientStatus =
            typeof fastifyError?.code === 'string' &&
            fastifyError.code.startsWith('FST_') &&
            typeof fastifyError.statusCode === 'number' &&
            fastifyError.statusCode >= 400 &&
            fastifyError.statusCode < 500
                ? fastifyError.statusCode
                : undefined
        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : (clientStatus ?? HttpStatus.INTERNAL_SERVER_ERROR)
        const metadata = `Request [${request.id}]: ${request.method} ${request.url.split('?')[0]} - ${status}`
        if (status >= 500)
            this.loggerService.error(metadata, exception instanceof Error ? exception.stack : 'Unknown error')
        else this.loggerService.warn(metadata)

        let message: unknown =
            clientStatus === 413 ? 'Payload too large' : clientStatus ? 'Invalid request' : 'Internal server error'
        let errors: unknown = undefined

        if (exception instanceof HttpException) {
            const res = exception.getResponse()

            if (res && typeof res === 'object') {
                const body = res as { message?: unknown; errors?: unknown }
                message = body.message || message
                errors = body.errors
            } else {
                message = res
            }
        }

        reply.status(status).send({
            success: false,
            statusCode: status,
            message,
            errors,
            timestamp: new Date().toISOString(),
            requestId: request.id,
            path: request.url.split('?')[0]
        })
    }
}
