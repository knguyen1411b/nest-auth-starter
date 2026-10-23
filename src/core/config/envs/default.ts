import { Config } from '../interfaces/config'

export default (): Config => {
    const origins = (process.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)
    return {
        app: {
            name: process.env.APP_NAME || 'nest-auth-starter',
            version: process.env.APP_VERSION || '1.0.0',
            port: Number(process.env.PORT) || 3000,
            host: process.env.HOST || '0.0.0.0',
            apiPrefix: process.env.API_PREFIX || 'api'
        },
        database: { url: process.env.DATABASE_URL ?? '' },
        auth: {
            jwt: {
                secret: process.env.JWT_SECRET ?? '',
                expiresIn: Number(process.env.JWT_EXPIRES_IN) || 900,
                // Environment values are seconds; Date arithmetic uses milliseconds.
                refreshExpiresIn: (Number(process.env.JWT_REFRESH_EXPIRES_IN) || 604800) * 1000,
                sessionMaxAge: (Number(process.env.SESSION_MAX_AGE) || 2592000) * 1000
            }
        },
        cors: {
            enabled: true,
            origin: origins.includes('*') ? '*' : origins,
            credentials: !origins.includes('*'),
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
        },
        swagger: {
            enabled: true,
            title: 'nest-auth-starter',
            description: 'nest-auth-starter API documentation',
            version: process.env.API_DOCS_VERSION || '1.0.0',
            path: 'docs',
            openApiVersion: process.env.OPEN_API_VERSION || '3.1.0'
        },
        cloudinary: {
            cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
            apiKey: process.env.CLOUDINARY_API_KEY ?? '',
            apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
            folder: process.env.CLOUDINARY_FOLDER || 'nest-auth-starter',
            publicIdPrefix: process.env.CLOUDINARY_PUBLIC_ID_PREFIX || 'user_'
        },
        mail: {
            host: process.env.MAIL_HOST || '127.0.0.1',
            port: Number(process.env.MAIL_PORT) || 1025,
            secure: process.env.MAIL_SECURE === 'true',
            from: process.env.MAIL_FROM || 'nest-auth-starter <noreply@example.com>',
            user: process.env.MAIL_USER ?? '',
            pass: process.env.MAIL_PASS ?? ''
        },
        security: { helmet: true, rateLimit: { ttl: 60000, limit: 100 } }
    }
}
