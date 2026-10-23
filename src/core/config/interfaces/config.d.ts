export interface AppConfig {
    name: string
    version: string
    port: number
    host: string
    apiPrefix: string
}

export interface AuthConfig {
    jwt: {
        secret: string
        expiresIn: number
        refreshExpiresIn: number
        sessionMaxAge: number
    }
}

export interface CorsConfig {
    enabled: boolean
    origin: string | string[]
    credentials: boolean
    methods: string[]
}

export interface SwaggerConfig {
    enabled: boolean
    title: string
    description: string
    version: string
    path: string
    openApiVersion: string
}

export interface SecurityConfig {
    helmet: boolean
    rateLimit: {
        ttl: number
        limit: number
    }
}

export interface DatabaseConfig {
    url: string
}

export interface CloudinaryConfig {
    cloudName: string
    apiKey: string
    apiSecret: string
    folder: string
    publicIdPrefix: string
}

export interface MailConfig {
    host: string
    port: number
    secure: boolean
    from: string
    user: string
    pass: string
}

export interface Config {
    app: AppConfig
    auth: AuthConfig
    cors: CorsConfig
    swagger: SwaggerConfig
    security: SecurityConfig
    database: DatabaseConfig
    cloudinary: CloudinaryConfig
    mail: MailConfig
}
