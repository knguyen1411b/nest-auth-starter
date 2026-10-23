import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface Response<T> {
    data: T
    meta?: Record<string, unknown>
    statusCode: number
    message: string
    timestamp: string
}

@Injectable()
export class TransformInterceptor implements NestInterceptor<unknown, Response<unknown>> {
    intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<Response<unknown>> {
        const response = context.switchToHttp().getResponse<FastifyReply>()

        return next.handle().pipe(
            map((data: unknown) => {
                const statusCode = response.statusCode
                const body = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : undefined

                return {
                    success: true,
                    statusCode,
                    message: typeof body?.message === 'string' ? body.message : 'Success',
                    data: body?.data ?? data,
                    meta:
                        body?.meta !== null && typeof body?.meta === 'object'
                            ? (body.meta as Record<string, unknown>)
                            : undefined,
                    timestamp: new Date().toISOString()
                }
            })
        )
    }
}
