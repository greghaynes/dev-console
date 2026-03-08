# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added — Phase 1.6: SPA Add Project from GitHub UI

- `ProjectsPage` now fetches projects from `GET /api/projects` on mount;
  replaces the hardcoded `PROJECTS` constant with live API data.
- `AddProjectDialog` fetches GitHub repositories from `GET /api/github/repos`
  on open; the "Add Project" button calls `POST /api/projects` with the
  selected repo's URL and updates the project list on success.
- MSW handlers in `client/src/mocks/handlers.ts`:
  - `GET /api/projects` → two seeded demo projects (`demo-web`, `demo-api`).
  - `POST /api/projects` → creates a project stub and appends it to the
    in-handler list.
  - `GET /api/github/repos` → four hard-coded GitHub repository stubs used
    by the repo-picker dialog.

### Added — Phase 1.5: SPA GitHub OAuth Login

- `client/src/context/AuthContext.tsx` — `AuthProvider` context that calls
  `GET /api/whoami` once on mount and exposes `{ user, loading }` to the
  component tree via the `useAuth()` hook.
- Updated `App.tsx`: wrapped the app in `<AuthProvider>`; added `RootRoute`
  that renders `LoginPage` in demo mode and redirects authenticated users to
  `/projects` in production; added `AuthGuard` that redirects unauthenticated
  users to `/` for all protected routes; removed the unused `/demo` route.
- Updated `LoginPage` (demo mode): replaced the password form with a "Try Demo"
  button that navigates directly to `/projects`.

### Added — Phase 1.4: Demo Login Page

- Vite + React + TypeScript SPA bootstrapped in `client/` with dark-theme
  inline styles (no Tailwind).
- `LoginPage` component: demo mode shows a password form (enter `demo`);
  production mode shows a "Sign in with GitHub" button linking to
  `/auth/login`.
- `DemoBanner` component: persistent bar reading "Demo mode — no data is
  saved", rendered at the app root when `VITE_DEMO_MODE === 'true'`.
- `ProjectsPage` component: responsive project-selection UI with desktop
  table view (Variant C) and mobile card view (Variant A), including an
  "Add Project" dialog with repo picker.
- MSW infrastructure: `client/src/mocks/handlers.ts`, `browser.ts`, and
  `server.ts` with initial `GET /api/whoami → { login: 'demo', id: 0 }`.
- Cloudflare Pages build support: `make site-build-with-demo` builds the SPA
  with `VITE_DEMO_MODE=true --base /demo/` and copies it into
  `site/static/demo/`.

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
