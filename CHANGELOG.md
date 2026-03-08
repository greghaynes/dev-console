# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added — Phase 1.3: Auth Validation Site

- `internal/templates/` package with embedded `html/template` files
  (`index.html`, `login.html`) and rendering helpers (`RenderIndex`,
  `RenderLogin`).
- `GET /login` — server-rendered HTML login page with a "Sign in with GitHub"
  link pointing to `GET /auth/login`.
- `GET /` — server-rendered HTML index page showing the authenticated user's
  GitHub login and ID, a session-valid confirmation, and a "Sign out" form;
  unauthenticated requests are redirected to `/login`.
- OAuth handler routes moved to the `/auth/` prefix:
  `GET /auth/login`, `GET /auth/callback`, `POST /auth/logout`.

### Added — Phase 1.2: GitHub OAuth Authentication

- `internal/auth/` package: OAuth login/callback/logout handlers, JWT-based
  session cookies, `RequireAuth` middleware, `/api/whoami` endpoint, and
  GitHub user allowlist enforcement.

### Added — Phase 1.1: Server Scaffolding

- `go.mod` / `go.sum` with initial dependencies.
- `cmd/dev-console/main.go` — flag parsing, config loading, graceful shutdown.
- `internal/config/config.go` — YAML config struct with `${ENV_VAR}`
  substitution.
