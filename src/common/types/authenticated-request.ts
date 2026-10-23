import { FastifyRequest } from 'fastify'
import { User } from 'generated/prisma/client'

export type AuthenticatedRequest = FastifyRequest & { user: User }
