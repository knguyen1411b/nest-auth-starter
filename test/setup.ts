import 'reflect-metadata'

// Synthetic credentials: tests never read real service credentials from .env.
Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/nest_auth_starter_test',
    JWT_SECRET: 'test-only-secret-not-for-production',
    JWT_EXPIRES_IN: '900',
    JWT_REFRESH_EXPIRES_IN: '604800',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    CLOUDINARY_CLOUD_NAME: 'test',
    CLOUDINARY_API_KEY: 'test',
    CLOUDINARY_API_SECRET: 'test',
    MAIL_USER: 'test@example.com',
    MAIL_PASS: 'test',
    HOST: '127.0.0.1'
})
