import { ConfigService as NestConfigService } from '@nestjs/config'

import { ConfigService } from '@/core/config/config.service'
import { envValidationSchema } from '@/core/config/env.validation'
import defaultConfig from '@/core/config/envs/default'
import developmentConfig from '@/core/config/envs/development'
import productionConfig from '@/core/config/envs/production'

describe('Configuration', () => {
    const env = {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://localhost/test',
        JWT_SECRET: 'test',
        ALLOWED_ORIGINS: 'http://localhost',
        CLOUDINARY_CLOUD_NAME: 'test',
        CLOUDINARY_API_KEY: 'test',
        CLOUDINARY_API_SECRET: 'test',
        MAIL_USER: 'test@example.com',
        MAIL_PASS: 'test'
    }

    it('accepts a complete environment and applies default access-token expiry', () => {
        const result = envValidationSchema.validate(env)
        const value = result.value as { JWT_EXPIRES_IN: number }
        const error = result.error
        expect(error).toBeUndefined()
        expect(value.JWT_EXPIRES_IN).toBe(900)
    })

    it.each(['DATABASE_URL', 'JWT_SECRET', 'ALLOWED_ORIGINS'])('rejects a missing %s', key => {
        const invalid = { ...env }
        delete invalid[key]
        expect(envValidationSchema.validate(invalid).error).toBeDefined()
    })

    it('rejects unsupported environments', () => {
        expect(envValidationSchema.validate({ ...env, NODE_ENV: 'staging' }).error).toBeDefined()
    })

    it.each(['short', 'replace_with_a_random_secret_that_is_long_enough', 'development-only-change-before-deployment'])(
        'rejects weak or placeholder production JWT secrets (%s)',
        secret => {
            expect(
                envValidationSchema.validate({ ...env, NODE_ENV: 'production', JWT_SECRET: secret }).error
            ).toBeDefined()
        }
    )

    it('accepts local SMTP without credentials and disabled Cloudinary', () => {
        expect(
            envValidationSchema.validate({
                ...env,
                MAIL_USER: '',
                MAIL_PASS: '',
                CLOUDINARY_CLOUD_NAME: '',
                CLOUDINARY_API_KEY: '',
                CLOUDINARY_API_SECRET: ''
            }).error
        ).toBeUndefined()
    })

    it('rejects partially configured providers', () => {
        expect(envValidationSchema.validate({ ...env, MAIL_PASS: '' }).error).toBeDefined()
        expect(envValidationSchema.validate({ ...env, CLOUDINARY_API_SECRET: '' }).error).toBeDefined()
    })

    it('rejects wildcard CORS origins in production', () => {
        expect(
            envValidationSchema.validate({
                ...env,
                NODE_ENV: 'production',
                JWT_SECRET: 'a'.repeat(64),
                ALLOWED_ORIGINS: '*'
            }).error
        ).toBeDefined()
    })

    it.each(['default', 'development', 'production'] as const)(
        'loads %s configuration from environment variables',
        name => {
            const factory = { default: defaultConfig, development: developmentConfig, production: productionConfig }[
                name
            ]
            expect(factory().auth.jwt).toMatchObject({
                secret: process.env.JWT_SECRET,
                expiresIn: 900,
                refreshExpiresIn: 604800000
            })
        }
    )

    it('disables documentation in production', () => {
        expect(productionConfig().swagger.enabled).toBe(false)
        expect(developmentConfig().swagger.enabled).toBe(true)
    })

    it('returns every configured section through its public accessor', () => {
        const values = defaultConfig()
        const service = new ConfigService(new NestConfigService(values))
        expect(service.getAppConfig()).toEqual(values.app)
        expect(service.getAuthConfig()).toEqual(values.auth)
        expect(service.getDatabaseConfig()).toEqual(values.database)
        expect(service.getCorsConfig()).toEqual(values.cors)
        expect(service.getSwaggerConfig()).toEqual(values.swagger)
        expect(service.getSecurityConfig()).toEqual(values.security)
        expect(service.getMailConfig()).toEqual(values.mail)
        expect(service.getCloudinaryConfig()).toEqual(values.cloudinary)
    })

    it('fails explicitly when a configuration key is absent', () => {
        const service = new ConfigService(new NestConfigService({}))
        expect(() => service.get<unknown>('missing')).toThrow('Configuration key missing is undefined')
    })
})
