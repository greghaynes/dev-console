# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added — Phase 1.7: Project and Workspace Registration

- `internal/slug/` package: `Generate(input, exists)` helper that produces
  URL-safe slugs from repository URLs or branch names with numeric-suffix
  deduplication.
- `internal/project/` package: `Project` struct, thread-safe `Manager`
  (in-memory registry backed by a git clone on disk), and HTTP handlers for
  `GET /api/projects`, `POST /api/projects`, `GET /api/projects/:pid`, and
  `DELETE /api/projects/:pid` (cascade removes all workspaces before deleting
  the on-disk clone).
- `internal/workspace/` package: `Workspace` struct, thread-safe `Manager`
  (in-memory registry backed by git worktrees), and HTTP handlers for
  `GET /api/projects/:pid/workspaces`, `POST /api/projects/:pid/workspaces`,
  `GET /api/projects/:pid/workspaces/:wid`, and
  `DELETE /api/projects/:pid/workspaces/:wid`.
- `GET /api/github/repos` endpoint that proxies GitHub's
  `GET /user/repos?per_page=100&sort=updated` API using the OAuth token stored
  in the session JWT; returns a normalised array of `{ id, fullName,
  description, language, updatedAt, htmlURL }`.
- GitHub OAuth access token is now stored in the session JWT (under the
  `oauthToken` claim) so that the `/api/github/repos` handler can use it
  without an extra round-trip.
- `internal/config/` extended with a `StorageConfig` struct (`projectsDir`
  field) wired to the new `storage.projectsDir` YAML key.

### Added — Phase 1.6: SPA Add Project from GitHub

- `GET /api/projects`, `POST /api/projects`, and `GET /api/github/repos` MSW
  handlers added to `client/src/mocks/handlers.ts`; `POST` handler appends the
  new project to the in-handler store so the project list refreshes correctly.
- `ProjectsPage` now fetches `GET /api/projects` on mount using
  `useEffect` + `useState`; hardcoded `PROJECTS` constant removed; API response
  is adapted to the existing UI shape via a `toUiProject()` helper.
- `DesktopView` and `MobileView` now receive a `projects` prop instead of
  reading the module-level constant; loading and error states added.
- `AddProjectDialog` now fetches `GET /api/github/repos` on open; the "Add
  Project" button calls `POST /api/projects` with `{ repoURL: selectedRepo.htmlURL }`
  and accepts an `onAdd` callback that re-fetches the project list on success.
- `ApiProject`, `ApiRepo`, `UiWorkspace`, and `UiProject` TypeScript interfaces
  replace `typeof PROJECTS[0]` and `typeof REPOS[0]` inline types throughout
  the file.

### Added — Phase 1.5: SPA GitHub OAuth Login

- `client/src/context/AuthContext.tsx` — `AuthProvider` component and `useAuth`
  hook; calls `GET /api/whoami` once on mount and exposes `{ user, loading }` to
  the component tree.
- Updated `client/src/App.tsx`: wrapped in `<AuthProvider>`; added `RootRoute`
  (auth-aware redirect logic at `/`) and `AuthGuard` (protects `/projects`);
  removed unused `/demo` catch-all route.
- Updated `client/src/pages/LoginPage.tsx`: demo mode now shows a single
  "Try Demo" button that navigates directly to `/projects` (removes the
  password form from Phase 1.4).

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
