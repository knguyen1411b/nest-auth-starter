# Architecture

`nest-auth-starter` is a feature-oriented NestJS monolith. Controllers validate HTTP input, services own business rules, and Prisma owns database access. No repository wrappers, CQRS or microservices are required for the current scope.

- `modules/auth`: registration, email verification, password recovery, login and device sessions. Access JWTs carry `sub`, `ver` and `sid`; each request checks account state/version and session expiry. Refresh rotation is transactional and preserves the device ID and absolute expiry. Consumed-token hashes permit replay revocation without storing plaintext credentials.
- `modules/user`: safe profile projections, ADMIN/EDITOR authorization, pagination, search, soft deletion and optional avatars. Password/role/email changes and lock/disable revoke sessions; password changes also invalidate old password-reset requests through tokenVersion.
- `modules/health`: process liveness, database readiness and rate-limited diagnostics.
- `core`: explicit Prisma, password/JWT/token, SMTP, Cloudinary and PostgreSQL rate-limit adapters. Only config and logger are global.
- `common`: HTTP guards, decorators, response envelopes, request logging and error handling.
- `configure-app.ts`: shared production/test HTTP configuration. `main.ts` creates the listener and trusted-proxy settings.

## Data consistency

Session creation uses a per-user PostgreSQL advisory transaction lock to enforce five devices across replicas. Rotation and replay revocation use a per-device lock and conditional consumption. Concurrent reuse revokes the device; clients must serialize refresh requests.

Verification/reset tokens have unique hashes and conditional single-use deletes in transactions. Password reset checks the account tokenVersion captured when the request was issued. Account status/version and session checks happen on every authenticated request; this intentionally trades extra database reads for immediate revocation.

External SMTP/Cloudinary operations cannot share PostgreSQL transactions. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for recovery paths and product decisions.

## Extending

Add a feature module under `src/modules/<feature>`. Keep HTTP details in controllers and use typed Prisma inputs/selects in services. Use transactions for invariants, integration tests for database behavior and mocks only at external adapter boundaries.

See [DEPLOYMENT.md](DEPLOYMENT.md) and [test/README.md](test/README.md) for migration and verification workflows.
