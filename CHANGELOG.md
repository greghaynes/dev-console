# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added — Phase 2.1: File API

- `GET /api/projects/:pid/workspaces/:wid/files?path=<dir>` — returns a JSON
  array of `{ name, type, size, modTime }` directory entries for the given path
  (defaults to workspace root); 400 for paths that escape the workspace root;
  404 for unknown project/workspace or path.
- `GET /api/projects/:pid/workspaces/:wid/file?path=<file>` — returns raw file
  contents using `http.ServeFile`; 400 if `path` is absent or escapes the root;
  404 for unknown project/workspace or missing file; 400 if path resolves to a
  directory.
- `safeWorkspacePath` helper in `internal/workspace/handlers.go` that resolves a
  client-supplied relative path, cleans it with `filepath.Abs`+`filepath.Clean`,
  and rejects anything that escapes the workspace root — path-traversal
  protection for both new endpoints.
- New tests in `internal/workspace/workspace_test.go`:
  `TestFilesHandler_ListsDirectory`, `TestFilesHandler_SubdirectoryPath`,
  `TestFilesHandler_PathTraversal`, `TestFileHandler_ReturnsFileContents`,
  `TestFileHandler_MissingPath`, `TestFileHandler_PathTraversal`.

### Added — Phase 2.2: File Browser UI

- `client/src/components/FileTree.tsx` — collapsible file tree; lazily loads
  directory contents one level at a time from
  `GET /api/projects/:pid/workspaces/:wid/files`; highlights the selected file;
  keyboard-accessible (`Enter`/`Space` on each row).
- `client/src/components/FileViewer.tsx` — fetches raw file contents from
  `GET /api/projects/:pid/workspaces/:wid/file` and renders them in a `<pre>`
  block with client-side syntax highlighting via `highlight.js` (github-dark
  theme); filename shown in a sticky header.
- `client/src/pages/WorkspacePage.tsx` — split layout: collapsible file tree
  sidebar on the left, tabbed panel (Terminal / File) on the right; clicking a
  file in the tree switches to the File tab and loads `FileViewer`; the terminal
  tab embeds the same PTY WebSocket logic as `TerminalPage`; a toggle button
  collapses/expands the sidebar; route
  `/projects/:pid/workspaces/:wid`.
- `client/src/App.tsx` — added `WorkspacePage` at
  `/projects/:pid/workspaces/:wid` (behind `AuthGuard`); the standalone
  `TerminalPage` route (`/projects/:pid/workspaces/:wid/terminal`) is kept for
  backward compatibility.
- `client/src/pages/WorkspaceListPage.tsx` — workspace rows now navigate to the
  new `WorkspacePage` (`/projects/:pid/workspaces/:wid`) instead of directly to
  the terminal.
- `client/src/mocks/handlers.ts` — added demo MSW handlers:
  `GET /api/projects/:pid/workspaces/:wid/files` returns a small hard-coded
  directory tree; `GET /api/projects/:pid/workspaces/:wid/file` returns
  sample source files keyed by path.
- `highlight.js@11.11.1` added as a client dependency.

### Added — Phase 1.9: Minimal Web Client

- `client/src/pages/WorkspaceListPage.tsx` — lists workspaces for a selected
  project (`GET /api/projects/:pid/workspaces`); breadcrumb navigation (← Back
  to projects); "New Workspace" dialog posts `POST /api/projects/:pid/workspaces`
  and refreshes the list; each workspace row has "Open Terminal ›" and "✕
  Delete" buttons; responsive layout at 375 px viewport.
- `client/src/pages/TerminalPage.tsx` — creates a terminal session
  (`POST /api/projects/:pid/workspaces/:wid/terminals`), opens a WebSocket at
  `WS /api/projects/:pid/workspaces/:wid/terminals/:tid`, and renders an
  `@xterm/xterm` `Terminal` instance attached to it; sends
  `{ "type": "resize", "cols": N, "rows": N }` on open and on window resize;
  full cleanup on unmount; in demo mode uses an in-process echo socket so no
  server process is required.
- `internal/spa/` package — embeds the compiled React SPA via `//go:embed
  all:dist` and exposes `Handler()`, an `http.Handler` that serves static assets
  with an `index.html` fallback for client-side routes.
- `cmd/dev-console/main.go` — removed `internal/templates/` (`GET /` and
  `GET /login` template routes); replaced with `r.PathPrefix("/").Handler(spa.Handler())`
  catch-all so the SPA handles the login page and all client-side routes.
- `internal/auth/` — `RequireAuth` now always returns 401 for unauthenticated
  requests (HTML redirect to `/login` removed since the SPA owns that route);
  `LogoutHandler` redirects to `/` instead of `/login`.
- `client/src/App.tsx` — added routes for `WorkspaceListPage`
  (`/projects/:pid/workspaces`) and `TerminalPage`
  (`/projects/:pid/workspaces/:wid/terminal`), both behind `AuthGuard`.
- `client/src/pages/ProjectsPage.tsx` — project rows and cards now navigate to
  `/projects/:pid/workspaces` instead of inline accordion expansion; removed
  `WorkspaceRow` sub-component (its role is now fulfilled by `WorkspaceListPage`).
- `client/src/mocks/handlers.ts` — added MSW handlers:
  `GET /api/projects/:pid`, `DELETE /api/projects/:pid`,
  `GET /api/projects/:pid/workspaces`, `POST /api/projects/:pid/workspaces`,
  `DELETE /api/projects/:pid/workspaces/:wid`,
  `POST /api/projects/:pid/workspaces/:wid/terminals`; per-project workspace
  in-memory store pre-seeded with one `main` workspace per demo project.
- `Makefile` — added `client-build` target; `build` target now runs
  `client-build` first and copies `client/dist/` to `internal/spa/dist/` before
  running `go build`.
- `@xterm/xterm v6.0.0` and `@xterm/addon-fit v0.11.0` added as client
  dependencies.

### Added — Phase 1.8: Terminal Backend

- `internal/terminal/` package: `Session` struct wrapping a `creack/pty` PTY +
  `exec.Cmd` (shell) with `Resize` and `Close` methods; thread-safe `Manager`
  with `Create`, `Get`, and `Delete` operations keyed by `(projectID, workspaceID, id)`.
- Shell process starts with `cwd` set to the workspace worktree root and
  `TERM=xterm-256color` in its environment; shell binary is resolved from the
  `$SHELL` environment variable with `/bin/bash` and `/bin/sh` fallbacks.
- REST endpoints (behind `RequireAuth`):
  - `POST /api/projects/:pid/workspaces/:wid/terminals` — creates a terminal
    session and returns `{ "terminalId": "<id>" }` with HTTP 201; 404 if the
    project or workspace is unknown; 502 if PTY creation fails.
  - `DELETE /api/projects/:pid/workspaces/:wid/terminals/:tid` — closes the
    PTY, terminates the shell process, and removes the session; returns 204 on
    success, 404 if not found.
- WebSocket endpoint `WS /api/projects/:pid/workspaces/:wid/terminals/:tid`:
  - Text frames containing `{ "type": "resize", "cols": N, "rows": N }` are
    applied as `TIOCSWINSZ` ioctls; all other text and binary frames are written
    directly to PTY stdin.
  - PTY stdout is pumped to the client as binary WebSocket frames.
  - The session is removed from the manager when the WebSocket closes.
- `gorilla/websocket v1.5.3` and `creack/pty v1.1.24` added as dependencies.
- HTTP server `ReadTimeout` and `WriteTimeout` set to `0` (no per-connection
  timeout) to support long-lived WebSocket terminal sessions; `IdleTimeout`
  extended to 120 s.

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
