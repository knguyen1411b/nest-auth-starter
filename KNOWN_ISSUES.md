# Scope and limitations

- This template is a REST API backend, not a complete SaaS frontend. OAuth/OIDC, MFA/passkeys and browser cookie/CSRF flows are not implemented.
- SMTP and Cloudinary failures are returned to the caller; there is no durable email queue or transactional outbox. A registration may persist while SMTP returns 503; use resend-verification.
- Admin email changes clear verification status, but do not automatically initiate email verification. Define that workflow before treating `emailVerifiedAt` as a requirement for every account.
- Search uses substring matching and lists use offset pagination plus counts. Benchmark with representative data before adding search indexes or cursor pagination.
- Rate limits use PostgreSQL transactions; load testing and provider-capacity testing remain deployment-specific.
- Used refresh-token hashes expire with the absolute session lifetime and are cleaned on login. Inactive installations may retain expired records until a later login; add scheduled maintenance if needed.
- Old refresh formats and JWTs without session IDs are intentionally rejected. Upgrade requires sign-in again.
- Invalid upload content is validated by Cloudinary; provider errors currently use the generic server-error envelope. Avatar replacement and DB update are not one distributed transaction.
- Docker, SMTP delivery and Cloudinary behavior require verification in the target environment. Mocked tests do not establish external provider availability.
