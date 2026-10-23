# Security

Report vulnerabilities privately to the repository owner through GitHub private vulnerability reporting when enabled. Do not post credentials or working exploits in public issues.

- Keep secrets in private environment variables or a secret manager. Never publish `.env`, database dumps or production logs.
- This backend returns bearer tokens in JSON. It does not implement a browser cookie session or a BFF. Decide token storage in the client; avoid persisting bearer credentials in browser localStorage. If adding cookies, add Secure/HttpOnly/SameSite settings and appropriate CSRF protection.
- API consumers must use HTTPS and serialize refresh requests. Tokens, passwords, authorization headers and email links must not be logged.
- Password reset/verification tokens are random, stored as SHA-256 hashes, expire and are consumed atomically. Forgotten-password success responses do not disclose missing accounts; SMTP outages can still create observable differences.
- Registration returns conflicts for duplicate username/email. Account existence is not fully hidden. Rate limiting reduces abuse but is not a complete anti-bot system.
- Admins can create active accounts and change email without user confirmation. Such changes clear verification status and revoke sessions. Adapt this trusted-admin policy for your product.
- Do not expose Mailpit, development PostgreSQL ports or detailed health diagnostics publicly. Protect diagnostics at the ingress if needed.
- Run `pnpm audit --prod` and review dependency updates regularly; a clean audit is not a security guarantee.
