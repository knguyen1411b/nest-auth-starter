# nest-auth-starter

NestJS REST API starter using Fastify, PostgreSQL and Prisma. Includes email activation, password recovery, role-based user administration and revocable JWT sessions.

## Features

- Short-lived JWT access tokens tied to server-side sessions; immediate device/all-device logout.
- Hashed opaque refresh tokens, atomic rotation, replay revocation, five devices per user and absolute session expiry.
- One-time email verification and password reset; password changes revoke existing sessions.
- ADMIN / EDITOR / USER roles, soft deletion, search and pagination.
- Shared PostgreSQL rate limiting, Helmet, CORS, request IDs and structured production logs.
- Optional Cloudinary avatars, configurable SMTP, local PostgreSQL and Mailpit.
- Database migrations, unit/API/PostgreSQL tests and GitHub Actions CI.

## Run locally

Use Node.js 22.12+ or 24 LTS, pnpm 12.3.4 and Docker Compose. Use the GitHub **Use this template** button once the repository is published and marked as a template, or clone your copy.

```sh
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` (`cp .env.example .env` on Unix or `Copy-Item .env.example .env` in PowerShell). Preserve any existing private configuration.

```sh
docker compose up -d --wait
pnpm run db:generate
pnpm run db:deploy
pnpm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger (development only): `http://localhost:3000/docs`
- Local email inbox: `http://localhost:8025`
- Liveness: `GET /api/v1/health`; database readiness: `GET /api/v1/health/ready`.

SMTP uses Mailpit locally; no Gmail account is needed. Avatar uploads return 503 until all Cloudinary credentials are configured. `docker compose down` preserves the local database volume.

## Try authentication

Register with `POST /api/v1/auth/register`:

```json
{"username":"alice","email":"alice@example.com","fullName":"Alice Example","password":"StrongPassword123!"}
```

Open Mailpit, copy the verification token and send `{"token":"<64-character-token>"}` to `POST /api/v1/auth/verify-email`. Then log in at `POST /api/v1/auth/login` with `username` and `password`.

Login returns `{ "success": true, "data": { "accessToken": "...", "refreshToken": "..." }, ... }`. Send `Authorization: Bearer <accessToken>` to `GET /api/v1/users/me`.

| Endpoint under `/api/v1/auth` | Body | Authentication |
| --- | --- | --- |
| `POST /register` | username, email, fullName, password | Public |
| `POST /verify-email` | token | Public |
| `POST /resend-verification` | email | Public |
| `POST /login` | username, password | Public |
| `POST /refresh` | refreshToken | Public |
| `POST /change-password` | currentPassword, newPassword | Bearer |
| `POST /forgot-password` | email | Public |
| `POST /reset-password` | token, newPassword | Public |
| `POST /logout` | refreshToken | Bearer, owning user |
| `POST /logout-all` | none | Bearer |

Refresh replaces the refresh token. Clients must serialize refresh requests and atomically save the new token: replaying an old token revokes that device's session. Passwords require upper/lowercase and a digit, 8–72 UTF-8 bytes; admin seed requires at least 12 bytes. Usernames are 4–50 characters.

For an admin, set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in your private environment, then run `pnpm run db:seed`. Seed does not overwrite ordinary or deleted users. ADMIN manages all roles; EDITOR may create/update/delete only USER accounts. Both can read user lists/details. Admin email changes clear the email-verification timestamp and revoke sessions; they do not send verification automatically.

## Development and verification

```sh
pnpm run check
pnpm run test:cov
```

See [test/README.md](test/README.md) for PostgreSQL suites. The single `init_database` migration creates the complete current schema for a new database. Databases with the previous migration history require a separate reconciliation before using this migration set.

Changes to database models require a committed migration (`pnpm run db:migrate --name <change>`). Review generated SQL before deployment.

See [ARCHITECTURE.md](ARCHITECTURE.md), [DEPLOYMENT.md](DEPLOYMENT.md), [SECURITY.md](SECURITY.md) and [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for boundaries, deployment and limitations. This is an API backend; browser token storage and cookie/CSRF integration belong to the consuming application.
