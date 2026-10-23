# Tests

Use `pnpm install --frozen-lockfile`. Test scripts generate Prisma Client before running. Test fixtures use synthetic credentials and mock SMTP/Cloudinary; they never send real email or upload assets.

```sh
pnpm run check
pnpm run test:cov
```

`pnpm test` runs unit and API tests. API tests use real Nest/Fastify guards, validation and services with mocked database/provider boundaries.

## PostgreSQL suites

Start Docker Desktop, then:

```sh
docker compose -p nest-auth-starter-tests -f compose.test.yaml up -d --wait
```

Set `TEST_DATABASE_URL=postgresql://nest_test:nest_test@127.0.0.1:54329/nest_auth_starter_test` in your shell (`$env:TEST_DATABASE_URL='...'` in PowerShell; `export TEST_DATABASE_URL='...'` on Unix), then run:

```sh
pnpm run test:all
docker compose -p nest-auth-starter-tests -f compose.test.yaml down
```

Only explicitly supplied PostgreSQL databases ending in `_test` are accepted. Never use an application database. Each suite creates a random schema, applies the committed migrations via `prisma migrate deploy`, and deletes only that schema afterward. The test database role needs schema creation privileges.

`integration` covers real transactions, unique constraints, activation, session rotation/revocation, reset and shared rate limits. `regression` covers previously identified contracts. The full suite requires PostgreSQL; missing `TEST_DATABASE_URL` is a failure, not a skipped verification.

Coverage is written to `coverage/`; it excludes main/module wiring and DTO declarations. DTO behavior is tested separately. Test counts and coverage numbers should come from the current run rather than stale documentation.
