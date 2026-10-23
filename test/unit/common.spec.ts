import { BadRequestException, ExecutionContext, HttpException, Type, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { lastValueFrom, of, throwError } from 'rxjs'

import { Public } from '@/common/decorators/public.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { HttpExceptionFilter } from '@/common/filters/global-exception.filter'
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard'
import { RolesGuard } from '@/common/guards/roles.guard'
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor'
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor'
import { LoggerService } from '@/common/logger/logger.service'
import { RegisterDto } from '@/modules/auth/dto/auth.dto'
import { HealthService } from '@/modules/health/health.service'

import { loggerMock, registration, user } from '../helpers/fixtures'

function context(
    handler: () => unknown,
    controller: Type<unknown>,
    request: unknown = {},
    reply: unknown = { statusCode: 200 }
): ExecutionContext {
    return {
        getHandler: () => handler,
        getClass: () => controller,
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply })
    } as unknown as ExecutionContext
}

describe('Guard metadata and authorization', () => {
    class Controller {
        @Public() publicRoute(this: void) {}
        @Roles('ADMIN') adminRoute(this: void) {}
        ordinaryRoute(this: void) {}
    }

    it('allows a public route without invoking JWT authentication', () => {
        const guard = new JwtAuthGuard(new Reflector())
        expect(guard.canActivate(context(Controller.prototype.publicRoute, Controller))).toBe(true)
    })

    it('allows a route without a role restriction', () => {
        expect(
            new RolesGuard(new Reflector()).canActivate(context(Controller.prototype.ordinaryRoute, Controller))
        ).toBe(true)
    })

    it('allows an explicitly authorized role', () => {
        expect(
            new RolesGuard(new Reflector()).canActivate(
                context(Controller.prototype.adminRoute, Controller, { user: user({ role: 'ADMIN' }) })
            )
        ).toBe(true)
    })

    it.each([undefined, user({ role: 'USER' })])('denies a missing or unauthorized identity', identity => {
        expect(() =>
            new RolesGuard(new Reflector()).canActivate(
                context(Controller.prototype.adminRoute, Controller, { user: identity })
            )
        ).toThrow('You do not have permission')
    })

    it('applies role metadata at the controller level', () => {
        @Roles('EDITOR')
        class Editors {
            route(this: void) {}
        }
        expect(
            new RolesGuard(new Reflector()).canActivate(
                context(Editors.prototype.route, Editors, { user: user({ role: 'EDITOR' }) })
            )
        ).toBe(true)
    })
})

describe('Response transformation and exception handling', () => {
    const ctx = context(() => {}, class {}, { url: '/api/v1/example' }, { statusCode: 201 })

    it('wraps a plain result in the standard envelope', async () => {
        const result = await lastValueFrom(
            new TransformInterceptor().intercept(ctx, { handle: () => of({ id: 'one' }) })
        )
        expect(result).toMatchObject({ success: true, statusCode: 201, message: 'Success', data: { id: 'one' } })
        expect(result.timestamp).toEqual(expect.any(String) as unknown)
    })

    it('preserves pagination metadata and an explicit message', async () => {
        const result = await lastValueFrom(
            new TransformInterceptor().intercept(ctx, {
                handle: () => of({ data: [1], meta: { total: 1 }, message: 'Created' })
            })
        )
        expect(result).toMatchObject({ data: [1], meta: { total: 1 }, message: 'Created' })
    })

    it('supports handlers with no return value', async () => {
        const result = await lastValueFrom(new TransformInterceptor().intercept(ctx, { handle: () => of(undefined) }))
        expect(result).toMatchObject({ success: true, message: 'Success' })
    })

    it.each([
        [new BadRequestException({ message: 'Invalid input', errors: { email: ['invalid'] } }), 400, 'Invalid input'],
        [new HttpException('Forbidden', 403), 403, 'Forbidden'],
        [new Error('secret infrastructure detail'), 500, 'Internal server error']
    ])('formats an exception without leaking internal details (%s)', (error, status, message) => {
        const reply = { status: jest.fn().mockReturnThis(), send: jest.fn() }
        new HttpExceptionFilter(loggerMock() as unknown as LoggerService).catch(
            error,
            context(() => {}, class {}, { url: '/api/example' }, reply)
        )
        expect(reply.status).toHaveBeenCalledWith(status)
        expect(reply.send).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, statusCode: status, message, path: '/api/example' })
        )
        if (status === 500) expect(JSON.stringify(reply.send.mock.calls)).not.toContain('secret infrastructure detail')
    })
})

describe('Global DTO validation', () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
    const metadata = { type: 'body' as const, metatype: RegisterDto }

    it('accepts valid registration data', async () => {
        expect(await pipe.transform(registration, metadata)).toEqual(registration)
    })

    it.each([{}, undefined, null])('rejects an empty body (%s)', async value => {
        await expect(pipe.transform(value, metadata)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects undeclared fields', async () => {
        await expect(pipe.transform({ ...registration, role: 'ADMIN' }, metadata)).rejects.toBeInstanceOf(
            BadRequestException
        )
    })

    it('returns field-specific validation errors', async () => {
        try {
            await pipe.transform({ ...registration, email: 'bad' }, metadata)
            throw new Error('Expected validation failure')
        } catch (error) {
            expect(error).toBeInstanceOf(BadRequestException)
            expect((error as BadRequestException).getResponse()).toMatchObject({
                message: expect.any(Array) as unknown
            })
        }
    })

    it('passes primitive parameters through', async () => {
        expect(await pipe.transform('id', { type: 'param', metatype: String })).toBe('id')
        expect(await pipe.transform({ arbitrary: true }, { type: 'body' })).toEqual({ arbitrary: true })
    })
})

describe('Request logging', () => {
    it('logs request metadata without credentials and preserves the response', async () => {
        const logs = loggerMock()
        const interceptor = new LoggingInterceptor(logs as unknown as LoggerService)
        const ctx = context(() => {}, class {}, {
            method: 'POST',
            id: 'trace-id',
            ip: '127.0.0.1',
            url: '/login',
            headers: { 'x-request-id': 'trace-id' },
            body: { password: 'sensitive-password', username: 'alice' },
            socket: { remoteAddress: '127.0.0.1' }
        })
        expect(await lastValueFrom(interceptor.intercept(ctx, { handle: () => of({ ok: true }) }))).toEqual({
            ok: true
        })
        const output = JSON.stringify(logs.log.mock.calls)
        expect(output).toContain('trace-id')
        expect(output).not.toContain('sensitive-password')
    })

    it('logs and propagates handler failures', async () => {
        const logs = loggerMock()
        const error = new Error('handler failed')
        const interceptor = new LoggingInterceptor(logs as unknown as LoggerService)
        await expect(
            lastValueFrom(
                interceptor.intercept(
                    context(() => {}, class {}, { method: 'GET', url: '/example', headers: {} }),
                    { handle: () => throwError(() => error) }
                )
            )
        ).rejects.toBe(error)
        expect(logs.error).toHaveBeenCalled()
    })
})

describe('Health service', () => {
    it('reports process liveness and resource measurements', () => {
        const service = new HealthService({} as never)
        expect(service.healthCheck()).toMatchObject({ status: 'healthy', uptime: expect.any(Number) as unknown })
        expect(service.detailedHealthCheck()).toMatchObject({
            status: 'healthy',
            environment: 'test',
            memory: { unit: 'MB', used: expect.any(Number) as unknown },
            cpu: { usage: expect.any(Object) as unknown }
        })
    })
})
