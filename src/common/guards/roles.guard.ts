import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from 'generated/prisma/enums'
import { Observable } from 'rxjs'

import { ROLES_KEY } from '../decorators/roles.decorator'
import type { AuthenticatedRequest } from '../types/authenticated-request'

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}
    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass()
        ])
        if (!requiredRoles) return true

        const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user

        if (!user) throw new ForbiddenException('You do not have permission to access this resource')

        const hasRole = requiredRoles.includes(user.role)

        if (!hasRole) throw new ForbiddenException('You do not have permission to access this resource')

        return true
    }
}
