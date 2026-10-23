import Joi from 'joi'

export const envValidationSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    APP_NAME: Joi.string().default('nest-auth-starter'),
    APP_VERSION: Joi.string().default('1.0.0'),
    PORT: Joi.number().integer().min(1).max(65535).default(3000),
    HOST: Joi.string().default('0.0.0.0'),
    API_PREFIX: Joi.string()
        .pattern(/^[a-zA-Z0-9_-]+$/)
        .default('api'),
    DATABASE_URL: Joi.string()
        .uri({ scheme: ['postgresql', 'postgres'] })
        .required(),
    JWT_SECRET: Joi.string()
        .when('NODE_ENV', {
            is: 'production',
            then: Joi.string()
                .min(32)
                .pattern(/^(?!.*(?:replace_with|change.?me|test.only|development)).*$/i),
            otherwise: Joi.string()
        })
        .required(),
    JWT_EXPIRES_IN: Joi.number().integer().positive().max(3600).default(900),
    JWT_REFRESH_EXPIRES_IN: Joi.number().integer().positive().default(604800),
    SESSION_MAX_AGE: Joi.number().integer().positive().default(2592000),
    ALLOWED_ORIGINS: Joi.string()
        .when('NODE_ENV', {
            is: 'production',
            then: Joi.string().pattern(/^[^*]+$/),
            otherwise: Joi.string()
        })
        .required(),
    TRUST_PROXY: Joi.string().allow('').default(''),
    API_DOCS_VERSION: Joi.string().default('1.0.0'),
    OPEN_API_VERSION: Joi.string().default('3.1.0'),
    CLOUDINARY_CLOUD_NAME: Joi.string().allow('').default(''),
    CLOUDINARY_API_KEY: Joi.string().allow('').default(''),
    CLOUDINARY_API_SECRET: Joi.string().allow('').default(''),
    CLOUDINARY_FOLDER: Joi.string().default('nest-auth-starter'),
    CLOUDINARY_PUBLIC_ID_PREFIX: Joi.string().default('user_'),
    MAIL_HOST: Joi.string().hostname().default('127.0.0.1'),
    MAIL_PORT: Joi.number().integer().min(1).max(65535).default(1025),
    MAIL_SECURE: Joi.boolean().default(false),
    MAIL_FROM: Joi.string().default('nest-auth-starter <noreply@example.com>'),
    MAIL_USER: Joi.string().allow('').default(''),
    MAIL_PASS: Joi.string().allow('').default('')
}).custom((value: Record<string, unknown>, helpers) => {
    const cloud = [value.CLOUDINARY_CLOUD_NAME, value.CLOUDINARY_API_KEY, value.CLOUDINARY_API_SECRET]
    if (cloud.some(Boolean) && !cloud.every(Boolean)) return helpers.error('any.custom')
    if (Boolean(value.MAIL_USER) !== Boolean(value.MAIL_PASS)) return helpers.error('any.custom')
    return value
}, 'provider credentials must be supplied together')
