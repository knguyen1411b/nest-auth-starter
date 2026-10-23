export type TestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface ApiEnvelope<T = unknown> {
    success: boolean
    statusCode: number
    timestamp: string
    message: string
    data: T
    meta?: { total: number; page: number; limit: number; pages: number }
}

export interface SessionTokens {
    accessToken: string
    refreshToken: string
}

export interface UserProfile {
    id: string
    username: string
    fullName: string | null
    avatarUrl: string | null
}

export interface AccessClaims {
    sub: string
    iat: number
    exp: number
}
