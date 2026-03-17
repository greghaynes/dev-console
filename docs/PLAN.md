---
title: "Implementation Plan"
weight: 20
---

# Dev Console — Phased Implementation Plan

This document translates the product design (see [DESIGN.md](DESIGN.md)) into an
ordered sequence of incremental milestones. Each phase ends with a working,
deployable slice of the system that can be used and tested end-to-end before the
next phase begins.

The guiding principle is **thin vertical slices over horizontal layers**: every
phase ships something a real user can interact with, even if the feature set is
narrow.

---

## Phase 1 — Minimal E2E Terminal

**Goal:** A user can open a browser, authenticate with GitHub, pick a workspace,
and get a fully functional terminal in that workspace. Nothing else.

This is the foundational slice. Every later phase builds on top of the server,
the auth middleware, and the client shell created here.

### 1.1 Server Scaffolding ✅

- `go.mod` / `go.sum` with initial dependencies
  (`gorilla/mux`, `gorilla/websocket`, `creack/pty`, `golang-jwt/jwt`,
  `gopkg.in/yaml.v3`)
- `cmd/dev-console/main.go` — flag parsing, config loading, `httpServer.ListenAndServe`
- `internal/config/config.go` — YAML config struct + `Load(path)` function
  (supports `${ENV_VAR}` substitution for secrets)
- Graceful shutdown on `SIGINT` / `SIGTERM`

**Acceptance:** `go build ./...` succeeds; `./dev-console --config dev-console.yaml`
starts and listens.

### 1.2 GitHub OAuth Authentication ✅

- `internal/auth/` package
  - OAuth redirect handler (`GET /auth/login`) — initiates the GitHub OAuth flow
  - OAuth callback handler (`GET /auth/callback`) — exchanges code for token,
    fetches GitHub user, sets signed HTTP-only session cookie
  - Logout handler (`POST /auth/logout`) — clears the session cookie
  - `RequireAuth` middleware that validates the session cookie on every protected
    route; redirects unauthenticated requests to `/login`
- JWT-based stateless sessions signed with operator-supplied `sessionSecret`;
  configurable TTL (default 24 h)
- Operator-configured allowlist of GitHub user IDs; returns 403 for users not
  on the list

**Acceptance:** Hitting `GET /auth/login` redirects to GitHub; after authorization
the user lands back on the server with a valid session cookie. A user not on the
allowlist sees a 403. A `/api/whoami` endpoint returns `{ login, id }` for the
authenticated user.

### 1.3 Auth Validation Site ✅

A minimal server-rendered HTML site (no external JS dependencies) served directly
by the Go backend to allow manual testing and validation of the auth system before
the full React SPA exists.

Pages / endpoints:

- `GET /` — if the session cookie is absent or invalid, redirect to `/login`;
  otherwise render a simple HTML page showing:
  - The authenticated user's GitHub login and ID (same data as `/api/whoami`,
    resolved server-side from the session)
  - A "Sign out" form that posts to `/auth/logout`
  - A brief confirmation that the session is valid
- `GET /login` — renders a page with a "Sign in with GitHub" link pointing to
  `GET /auth/login` (the OAuth redirect handler from step 1.2)
- The `/api/whoami`, `/auth/login`, `/auth/callback`, and `/auth/logout`
  endpoints from step 1.2 remain unchanged

Templates are Go `html/template` files stored in `internal/templates/` and
embedded in the binary via `go:embed`; styling uses only inline CSS so no
additional build step is required. This site is intentionally replaced by the
React SPA in step 1.7.

**Acceptance:** After completing step 1.2 configuration, an operator can:

1. Open the server URL in a browser; when unauthenticated, be redirected to
   `/login` and see a page with a "Sign in with GitHub" link.
2. Click the "Sign in with GitHub" link and be redirected to the GitHub OAuth
   flow.
3. Complete the OAuth flow and land on the index page (`/`) showing their
   GitHub login name.
4. Confirm that visiting `/` with no or an invalid cookie redirects to `/login`.
5. Confirm that a GitHub login **not** on the allowlist receives a 403 page
   after completing OAuth.
6. Click "Sign out" and confirm the session cookie is cleared and the browser
   returns to the login page.

### 1.4 Demo Login Page ✅

The earliest deliverable with a previewable frontend: a minimal Vite + React +
TypeScript SPA that renders only the `LoginPage`. This phase ships the entire
demo-mode infrastructure and the per-PR CI preview workflow before any real
backend plumbing beyond auth exists.

**Deployment model for this phase:** The React SPA is built as a standalone
static bundle deployed as part of the existing documentation site on Cloudflare
Pages — it is **not** embedded in the Go binary at this stage. Vite builds with
`--base /demo/`, and the output is copied into `site/static/demo/` before Hugo
runs. Hugo treats it as static content and includes it verbatim in `site/public/demo/`.
The demo is therefore accessible at the `/demo/` path on the same Cloudflare
Pages origin as the documentation, and no separate Cloudflare Pages project is
required. The Go-embedded HTML templates from Phase 1.3 (`internal/templates/`)
continue to serve `/login` and `/` for any running Go server instance. The SPA
does not interfere with Go-served routes because it is hosted on the Cloudflare
Pages documentation origin (a separate domain). The compiled SPA replaces the
Go templates in Phase 1.7, when it is embedded in the binary via `go:embed`.

**Client setup:**

- Vite project bootstrapped in `client/` with TypeScript, React, and Tailwind
  CSS (dark theme)

**`LoginPage` component:**

- **Demo mode** (`VITE_DEMO_MODE === 'true'`): renders a "Try Demo" heading, a
  password field, and a "Log in" button. Entering the static password `demo`
  navigates to a placeholder `/demo` page that reads "You're in — demo mode
  active". Entering any other password shows an inline error message. No network
  call is made.
- **Production mode**: renders a "Sign in with GitHub" button pointing to
  `/auth/login`

**MSW infrastructure** (created here, extended in later phases):

```text
client/src/mocks/
  handlers.ts   # starts empty except for GET /api/whoami → { login: "demo", id: 0 }
  browser.ts    # startWorker() — MSW Service Worker bootstrap
  server.ts     # setupServer() — Vitest / Node.js mock server
```

`client/src/main.tsx` conditionally starts the worker:

```ts
if (import.meta.env.VITE_DEMO_MODE === 'true') {
  const { startWorker } = await import('./mocks/browser')
  await startWorker()
}
```

**`DemoBanner`** component rendered at the app root whenever
`VITE_DEMO_MODE === 'true'`: a persistent bar reading **"Demo mode — no data is
saved"**.

**Cloudflare Pages build configuration:**

The demo SPA is built as part of the Cloudflare Pages build — no separate CI
workflow is needed. Configure the `dev-console` Cloudflare Pages project with:

| Setting | Value |
|---------|-------|
| Build command | `make site-build-with-demo` |
| Output directory | `site/public` |
| Node.js version | `22` |
| Environment variable | `VITE_DEMO_MODE=true` |

Cloudflare Pages' native GitHub integration triggers a build on every commit and
PR, and posts a deployment status with a preview URL directly on the PR. The demo
is accessible at `<preview-url>/demo/` alongside the documentation.

When `client/` does not yet exist (before Phase 1.4 is implemented), the build
command degrades gracefully: the `@if [ -d "client" ] && [ -f "client/package.json" ]`
guard in `make site-build-with-demo` is a no-op and only the Hugo docs are deployed.

**Acceptance:**

1. `VITE_DEMO_MODE=true npm run build` produces a static bundle with no server
   dependency.
2. `npm run preview` shows the login page; entering `demo` as the password
   navigates to the placeholder page; entering anything else shows an error.
3. Cloudflare Pages posts a preview URL on the PR; the demo is accessible at
   `<preview-url>/demo/` alongside the documentation.

### 1.5 SPA GitHub OAuth Login *(parallel with 1.6)* ✅

Connects the React SPA to the existing GitHub OAuth backend (Phase 1.2) and
gates protected pages behind authenticated sessions. Phases 1.5 and 1.6 are
**independent parallel tracks**: each can be merged without waiting for the
other.

- `client/src/context/AuthContext.tsx` — React context + `AuthProvider` that
  calls `GET /api/whoami` once on mount and exposes `{ user, loading }` to the
  component tree; no demo-specific branches in the context itself
- `useAuth()` hook exported from the same file; consumed by `RootRoute` and
  `AuthGuard`
- Update `client/src/App.tsx`:
  - Wrap the app in `<AuthProvider>`
  - `RootRoute` (at `/`): in demo mode always renders `LoginPage`; in
    production, shows a blank loading state while the `useAuth()` check is in
    flight, redirects to `/projects` if authenticated, shows `LoginPage`
    otherwise
  - `AuthGuard` wrapper: redirects unauthenticated users to `/` for all
    protected routes
  - `/projects` is now wrapped in `<AuthGuard>`
  - Remove the unused `/demo` catch-all route
- Update `client/src/pages/LoginPage.tsx` — demo mode: replace the
  `password` form from Phase 1.4 with a single **"Try Demo"** button that
  calls `navigate('/projects')` directly (no password check, no network call)

**MSW:** the existing `GET /api/whoami → { login: 'demo', id: 0 }` handler
from Phase 1.4 already satisfies the auth check on the `/projects` page in
demo mode; no new handlers are needed for this phase.

**Acceptance:**

1. Demo mode (`VITE_DEMO_MODE=true`): visiting `/demo/` shows the DemoBanner
   and the `LoginPage` with a "Try Demo" button; clicking it navigates to
   `/projects`.
2. Demo mode: visiting `/projects` directly (e.g., via the browser's address
   bar) renders the `ProjectsPage` without redirecting away.
3. Production mode (real server): visiting `/` with no session cookie renders
   the `LoginPage` with a "Sign in with GitHub" button.
4. Production mode: completing the GitHub OAuth flow sets a session cookie and
   the user is taken to `/projects`.
5. Production mode: visiting `/projects` with no session cookie redirects the
   browser to `/`.

### 1.6 SPA Add Project from GitHub *(parallel with 1.5)* ✅

Connects the project-list page to the REST API so users can browse their
GitHub repositories and register new projects. Phases 1.5 and 1.6 are
**independent parallel tracks**.

- Update `client/src/pages/ProjectsPage.tsx`:
  - Top-level `ProjectsPage` component fetches `GET /api/projects` on mount
    using `useEffect` + `useState`; replaces the hardcoded `PROJECTS` constant
    with live API data; adapts the API shape (`{ id, name, repoURL, createdAt }`)
    to the existing UI shape with a `toUiProject()` helper
  - Pass the project list as a prop to `DesktopView` and `MobileView` instead
    of reading the module-level constant; add loading and error states
  - `AddProjectDialog`: replace the hardcoded `REPOS` constant with a
    `useEffect` that calls `GET /api/github/repos` on open; update the "Add
    Project" button to call `POST /api/projects` with
    `{ repoURL: selectedRepo.htmlURL }`; accept an `onAdd` callback to refresh
    the project list on success
- Add the following MSW handlers to `client/src/mocks/handlers.ts`:
  - `GET /api/projects` → two hard-coded projects (`demo-web`, `demo-api`)
  - `POST /api/projects` → accepts `{ repoURL }`, inserts a new stub project
    into the in-handler list, and returns it as JSON
  - `GET /api/github/repos` → a short list of four hard-coded GitHub
    repository stubs (used by the repo-picker dialog)

**Note:** workspace data (`GET /api/projects/:pid/workspaces`) is not yet
connected; workspace rows in the accordion/card show an empty list until
Phase 1.8.

**Acceptance:**

1. Demo mode: the project list renders with the two seeded projects from MSW;
   no hardcoded constant is read.
2. Demo mode: clicking **"+ New Project"** opens the repo-picker dialog, which
   shows the four hard-coded GitHub repos.
3. Demo mode: selecting a repo and clicking **"Add Project"** closes the dialog
   and the new project appears in the list without a page reload.
4. Demo mode: `VITE_DEMO_MODE=true npm run build` succeeds with no errors.
5. Production mode: the project list and repo picker call real API endpoints;
   requires Phase 1.7 backend to be running.

### 1.7 Project and Workspace Registration ✅

**Data models** (as specified in `DESIGN.md §5.1` and `§6.1`):

```go
// internal/project/project.go
type Project struct {
    ID        string    `json:"id"`        // URL-safe slug (see ID generation below)
    Name      string    `json:"name"`      // Display name; defaults to the repo name portion of the URL
    RepoURL   string    `json:"repoURL"`   // HTTPS GitHub clone URL, e.g. "https://github.com/owner/repo"
    RootPath  string    `json:"-"`         // Absolute path: filepath.Join(storage.projectsDir, id); omitted from JSON
    CreatedAt time.Time `json:"createdAt"`
}

// internal/workspace/workspace.go
type Workspace struct {
    ID        string    `json:"id"`        // URL-safe slug (see ID generation below)
    ProjectID string    `json:"projectId"` // Parent project ID
    Name      string    `json:"name"`      // Display name; defaults to the branch name
    Branch    string    `json:"branch"`    // Git branch name
    PRNumber  *int      `json:"prNumber"`  // GitHub PR number; nil/JSON null means no PR is associated yet
    CreatedAt time.Time `json:"createdAt"`
}
```

**ID generation** (`internal/slug` package, `func Generate(input string, exists func(string) bool) string`):

- Extract the final path segment from the repo URL (or use the branch name as-is
  for workspaces).
- Lowercase the string; replace every run of non-alphanumeric characters with a
  single hyphen; trim leading/trailing hyphens.
- If the resulting slug is already taken (as determined by the `exists` callback),
  append `-2`, `-3`, etc. until a free slot is found.

**`internal/project/` package:**

- `Project` struct and `Manager` (thread-safe in-memory registry, `sync.RWMutex`; the
  corresponding on-disk artifact is the cloned git repository under `RootPath`)
- `Manager.Create(repoURL string) (*Project, error)` — generates the ID and
  name from the URL, sets `RootPath`, clones the repo, registers the record in
  memory
- `Manager.List() []*Project`, `Manager.Get(id) (*Project, error)`,
  `Manager.Delete(id) error` — standard CRUD; `Delete` cascades to workspaces
  and removes `RootPath` from disk

**`internal/workspace/` package:**

- `Workspace` struct and `Manager` (thread-safe in-memory registry scoped per
  project; the on-disk artifact is the git worktree under `RootPath/worktrees/<wid>/`)
- **Filesystem layout:** each workspace is a
  [git worktree](https://git-scm.com/docs/git-worktree) created at
  `<project.RootPath>/worktrees/<wid>/` via
  `git worktree add <path> <branch>`. This lets multiple workspaces check out
  different branches simultaneously without conflicts. The workspace root used
  by all file I/O and terminal sessions is this worktree path.
- `Manager.Create(projectID, branch, name string, prNumber *int) (*Workspace, error)`
  — generates the ID, runs `git worktree add`, registers the record in memory;
  returns an error (surfaced as 502) if the branch or worktree creation fails
- `Manager.List(projectID) []*Workspace`,
  `Manager.Get(projectID, id) (*Workspace, error)`,
  `Manager.Delete(projectID, id) error` — standard CRUD; `Delete` runs
  `git worktree remove` before removing the in-memory record

**REST endpoints** (all behind `RequireAuth`):

- `GET /api/projects` — returns the list of all projects;
  each item: `{ id, name, repoURL, createdAt }`
- `POST /api/projects` — request body: `{ "repoURL": "https://github.com/owner/repo" }`;
  creates the project record and clones the repo; response: full `Project`
  JSON (`id`, `name`, `repoURL`, `createdAt`; `rootPath` is intentionally
  omitted from API responses as a server-internal detail); 400 if `repoURL` is
  absent or not a valid GitHub HTTPS URL; 502 if the clone fails
- `GET /api/projects/:pid` — returns full project metadata (same shape as list
  item); 404 if unknown
- `DELETE /api/projects/:pid` — cascades: removes all workspaces (runs
  `git worktree remove` for each), deletes the on-disk clone, removes the
  project record; returns 204 on success; 404 if unknown
- `GET /api/github/repos` — fetches from `GET https://api.github.com/user/repos`
  (with `?per_page=100&sort=updated`) using the authenticated user's GitHub
  OAuth token stored in the session; returns a normalized array where each item
  maps GitHub's `id`, `full_name`, `description`, `language`, `updated_at`, and
  `html_url` fields to `{ id, fullName, description, language, updatedAt, htmlURL }`;
  used by the repo-picker dialog (Screen 2a in `WIREFRAMES.md`); 502 if the
  GitHub API request fails
- `GET /api/projects/:pid/workspaces` — returns the list of workspaces for the
  project; each item: `{ id, projectId, name, branch, prNumber, createdAt }`; 404 if
  project unknown
- `POST /api/projects/:pid/workspaces` — request body:
  `{ "branch": "feature/my-feature", "name": "My Feature", "prNumber": null }`;
  `name` defaults to the branch name when omitted; `prNumber` defaults to `null`;
  creates the workspace record and the git worktree; response: full `Workspace`
  JSON (`id`, `projectId`, `name`, `branch`, `prNumber`, `createdAt`); 400 if `branch` is
  absent; 404 if the project is unknown; 502 if `git worktree add` fails
- `GET /api/projects/:pid/workspaces/:wid` — returns full workspace metadata
  (same shape as list item, including `projectId`); 404 if project or workspace unknown
- `DELETE /api/projects/:pid/workspaces/:wid` — runs `git worktree remove`,
  removes the workspace record; returns 204 on success; 404 if unknown

**Acceptance:**

1. `POST /api/projects` with `{ "repoURL": "https://github.com/owner/repo" }`
   returns a project object with a generated `id` and `name`; a subsequent
   `GET /api/projects` response includes it; `GET /api/projects/:pid` returns
   its full metadata.
2. `DELETE /api/projects/:pid` returns 204; a subsequent `GET /api/projects/:pid`
   returns 404; the directory at `storage.projectsDir/<id>` no longer exists.
3. `POST /api/projects` with a missing or malformed `repoURL` returns 400; a
   valid URL pointing to a non-existent or inaccessible repo returns 502.
4. `GET /api/github/repos` returns a JSON array of repository objects for the
   authenticated user.
5. `POST /api/projects/:pid/workspaces` with `{ "branch": "main" }` returns a
   workspace object; a subsequent `GET /api/projects/:pid/workspaces` includes
   it; `GET /api/projects/:pid/workspaces/:wid` returns its metadata; a git
   worktree exists on disk at the expected path.
6. `DELETE /api/projects/:pid/workspaces/:wid` returns 204; a subsequent
   `GET /api/projects/:pid/workspaces/:wid` returns 404; the worktree directory
   no longer exists.
7. `DELETE /api/projects/:pid` also removes all of the project's workspaces and
   their worktrees.
8. `POST /api/projects/:pid/workspaces` with a missing `branch` returns 400;
   an unknown `:pid` returns 404.

### 1.8 Terminal Backend ✅

- `internal/terminal/` package
  - `Session` — wraps a `creack/pty` PTY + `exec.Cmd` (shell) + mutex-protected
    reference count; shell starts with `cwd` set to the workspace root
  - `Manager` — creates, retrieves, and destroys terminal sessions; enforces
    per-workspace session limit (initially unlimited)
- REST endpoints (behind `RequireAuth`):
  - `POST /api/projects/:pid/workspaces/:wid/terminals` → `{ terminalId }`
  - `DELETE /api/projects/:pid/workspaces/:wid/terminals/:tid`
- WebSocket endpoint `WS /api/projects/:pid/workspaces/:wid/terminals/:tid`:
  - Reads JSON `{ "type": "resize", "cols": N, "rows": N }` control frame on
    connect; subsequent binary/text frames are raw PTY stdin
  - Pumps PTY stdout as binary WebSocket frames to the client
  - Cleans up PTY on WebSocket close

**Acceptance:** `websocat` or a small test harness can attach to the WebSocket,
send resize + input, and receive shell output.

### 1.9 Minimal Web Client

Completes the full Phase 1 end-to-end flow by adding workspace management and
the embedded terminal. The `LoginPage` (Phase 1.5) and project registration UI
(Phase 1.6) are already complete; this phase adds:

- `WorkspaceListPage` — lists workspaces for a selected project; fetched from
  `GET /api/projects/:pid/workspaces`; includes a button to create a new
  workspace
- `TerminalPage` — creates a terminal session, opens the WebSocket, and renders
  an `xterm.js` `Terminal` instance attached to it; sends resize events when the
  window resizes; cleans up on unmount

The compiled SPA is embedded in the Go binary via `go:embed` and served from
`/`, replacing the Go-embedded HTML templates from Phase 1.3
(`internal/templates/`). The `internal/templates/` package and its routes
(`GET /` and `GET /login`) are removed in this phase once the SPA takes over.

Styling is minimal — Tailwind CSS with a dark theme matching a terminal aesthetic.
No design polish is required at this stage.

**Demo mode is a first-class deliverable of this phase, not an afterthought.**
MSW handlers for every new endpoint must be committed alongside the components —
not in a follow-up PR. See the
[Testing & Validation Strategy](#testing--validation-strategy) for the full
pattern.

**Demo mode for this phase** (extends the handlers from Phases 1.5 and 1.6):

- Add to `src/mocks/handlers.ts`:
  - `GET /api/projects/:pid` → metadata for the matching project
  - `DELETE /api/projects/:pid` → 204 success stub; removes the project from
    the in-demo-memory list so the UI refreshes correctly
  - `GET /api/projects/:pid/workspaces` → one pre-seeded workspace per project
    (`main` branch)
  - `POST /api/projects/:pid/workspaces` → returns a new workspace stub
  - `DELETE /api/projects/:pid/workspaces/:wid` → 204 success stub
  - WebSocket `WS /api/projects/:pid/workspaces/:wid/terminals/:tid` →
    in-process echo handler that prints a welcome banner and echoes input; no
    system processes are spawned
  - `POST /api/projects/:pid/workspaces/:wid/terminals` → returns
    `{ terminalId: "demo-term" }`

**Per-PR Cloudflare Pages deployment** is already active from Phase 1.4 — this
phase's changes will automatically trigger a preview.

**Acceptance:** The full flow works in Chrome and Safari on both desktop and a
375 px wide mobile viewport:

1. `VITE_DEMO_MODE=true npm run build` produces a static bundle with no server
   dependency.
2. `npm run preview` shows the demo banner and the full flow (login → project
   list → workspace list → open terminal → interactive echo session) without any
   backend.
3. Cloudflare Pages posts a preview URL on the PR; the demo is accessible at
   `<preview-url>/demo/` alongside the documentation.
4. Against a real server (no `VITE_DEMO_MODE`): login → project list →
   workspace list → open terminal → interactive shell session.

### Phase 1 Deliverables

| Artifact | Description |
|----------|-------------|
| `go.mod` | Go module definition |
| `cmd/dev-console/` | Server entry point |
| `internal/config/` | Config loading |
| `internal/auth/` | GitHub OAuth + session middleware |
| `internal/templates/` | `html/template` files (embedded via `go:embed`) for the auth validation site |
| `internal/project/` | Project registry |
| `internal/workspace/` | Workspace store with git worktree management (in-memory, created at runtime) |
| `internal/slug/` | URL-safe slug generation helper used by project and workspace managers |
| `internal/terminal/` | PTY session management |
| `client/` | Vite + React + TypeScript SPA (bootstrapped in Phase 1.4) |
| `client/src/context/AuthContext.tsx` | Auth context and `useAuth` hook (Phase 1.5) |
| `client/src/mocks/` | MSW handlers and browser/server worker entry points (created in Phase 1.4, extended in 1.5 and 1.6) |
| `docs/examples/dev-console.yaml.example` | Annotated sample configuration |
| `Makefile` | `make build`, `make dev`, `make test`, `make site-build-with-demo` targets |

---

## Phase 2 — File Browsing

**Goal:** Users can browse the workspace file tree and read file contents in the
browser.

### 2.1 File API

Add to `internal/workspace/`:

- `GET /api/projects/:pid/workspaces/:wid/files?path=<dir>` — returns a JSON
  list of directory entries (name, type, size, modTime) for `path`; defaults to
  workspace root
- `GET /api/projects/:pid/workspaces/:wid/file?path=<file>` — returns raw file
  contents

Both endpoints validate that the resolved path does not escape the workspace root
(path-traversal protection).

**Acceptance:** `curl` returns directory listings and file contents; requests for
paths outside the root return 400.

### 2.2 File Browser UI

- `FileTree` component — collapsible tree loaded lazily one directory at a time
  via `GET /api/projects/:pid/workspaces/:wid/files`
- `FileViewer` component — displays file contents with syntax highlighting
  (`highlight.js`)
- `WorkspacePage` — split layout: file tree on the left, viewer/terminal on the
  right; terminal from Phase 1 is accessible via a tab or panel
- MSW handlers added/updated in `src/mocks/handlers.ts` for all new endpoints:
  - `GET /api/projects/:pid/workspaces/:wid/files` → a small hard-coded
    directory tree
  - `GET /api/projects/:pid/workspaces/:wid/file` → a few sample source files

**Acceptance:** User can expand directories, click files, and read their contents.
The terminal panel remains accessible. Demo build works end-to-end without a
backend.

---

## Phase 3 — Basic Agent Chat

**Goal:** Users can open a chat session with an AI assistant that can read files
and answer questions about the workspace. No file writes yet.

### 3.1 LLM Client

- `internal/llm/` package — thin HTTP client over the OpenAI Chat Completions
  API (streaming); configurable base URL, model, and API key so it works with
  OpenAI, Anthropic (OpenAI-compatible endpoint), or Ollama

**Acceptance:** Unit test that stubs the HTTP response and verifies streamed
chunks are reassembled correctly.

### 3.2 Agent Session Backend (read-only)

- `internal/agent/` package
  - `Session` — holds conversation history (messages slice), in-flight cancel
    function, and status
  - `Manager` — CRUD for sessions scoped to a workspace within a project
- REST endpoints:
  - `GET /api/projects/:pid/workspaces/:wid/sessions`
  - `POST /api/projects/:pid/workspaces/:wid/sessions`
  - `DELETE /api/projects/:pid/workspaces/:wid/sessions/:sid`
  - `GET /api/projects/:pid/workspaces/:wid/sessions/:sid/messages`
- WebSocket `WS /api/projects/:pid/workspaces/:wid/sessions/:sid/chat`
  - Accepts `user_message` frames
  - Runs agent turn: streams `assistant_chunk` frames; interleaves `tool_call` /
    `tool_result` frames for read-only tools (`read_file`, `list_files`)
  - Sends `assistant_done` when the turn completes

**Tools enabled in this phase:** `read_file`, `list_files` (no `write_file` or
`run_command`)

**Acceptance:** User can ask "What files are in the root of this workspace?" and
receive a correct streamed answer.

### 3.3 Chat UI

- `ChatPanel` component — message history list, user input box, streaming
  assistant response rendered in real time (markdown via `react-markdown`)
- Tool calls and results shown as collapsible "tool use" blocks so the user can
  see what the agent is doing
- Cancel button that sends `{ "type": "cancel" }` to the WebSocket
- MSW handlers added/updated in `src/mocks/handlers.ts` for all new endpoints:
  - `GET /api/projects/:pid/workspaces/:wid/sessions` → empty list initially
  - `POST /api/projects/:pid/workspaces/:wid/sessions` → returns a new session
    stub
  - WebSocket `WS /api/projects/:pid/workspaces/:wid/sessions/:sid/chat` →
    scripted handler that emits a fixed sequence of `assistant_chunk` frames
    followed by `assistant_done`, simulating a real streaming turn

**Acceptance:** Full conversational loop visible in the browser; streaming text
appears word-by-word. Demo build works end-to-end without a backend.

---

## Phase 4 — Change Proposal & Review

**Goal:** The agent can propose file edits; the user reviews diffs and
accepts or rejects them before any file is written to disk.

### 4.1 Pending Change Backend

- `PendingChange` model (in-memory, keyed by session)
- `write_file` agent tool — diffs proposed content against current file, stores
  as `PendingChange`, emits `change_proposed` WebSocket frame
- REST endpoints:
  - `GET /api/projects/:pid/workspaces/:wid/sessions/:sid/changes`
  - `POST /api/projects/:pid/workspaces/:wid/sessions/:sid/changes/:cid/accept`
    — atomically writes file and marks change accepted
  - `POST /api/projects/:pid/workspaces/:wid/sessions/:sid/changes/:cid/reject`
    — marks change rejected without touching the file

**Acceptance:** Agent proposes a change; the in-memory store holds it; accept
endpoint writes the file.

### 4.2 Git Status & Diff API

- `GET /api/projects/:pid/workspaces/:wid/git/status` — runs
  `git status --porcelain` and returns structured JSON
- `GET /api/projects/:pid/workspaces/:wid/git/diff?path=` — returns unified diff
  for the given path (or all changes if path omitted)

**Acceptance:** After accepting a change, `git/status` reflects the modification.

### 4.3 Diff Review UI

- Badge on changed files in the `FileTree`
- `DiffViewer` component (using `react-diff-viewer`) for side-by-side or unified
  view
- Accept / Reject buttons per pending change
- `ChangesPanel` listing all pending changes for the session
- MSW handlers added/updated in `src/mocks/handlers.ts` for all new endpoints:
  - `GET /api/projects/:pid/workspaces/:wid/sessions/:sid/changes` → one
    pre-seeded pending change that modifies a file in the demo file tree
  - `POST …/changes/:cid/accept` and `…/changes/:cid/reject` → success stubs
  - `GET /api/projects/:pid/workspaces/:wid/git/status` → single modified file
    matching the pending change
  - `GET /api/projects/:pid/workspaces/:wid/git/diff` → a small hard-coded
    unified diff

**Acceptance:** User can trigger a file edit via chat, review the diff, and accept
or reject it. File tree updates after acceptance. Demo build works end-to-end
without a backend.

---

## Phase 5 — Full Agent Toolset & Manual Editing

**Goal:** The agent has its complete tool set; users can also manually edit files.

### 5.1 `run_command` Tool

- Executes a subprocess inside the workspace directory
- Command allowlist enforced from config
- Captures stdout/stderr (bounded buffer); returns to agent as tool result
- Timeout to prevent runaway processes

**Acceptance:** Agent can run `go test ./...` or `npm test` and report results.

### 5.2 `git_diff` Tool

- Returns current `git diff` (optionally scoped to a path)
- Agent can use it to verify its own changes before proposing them

### 5.3 Manual File Editor

- `FileEditor` component — contenteditable / textarea-based minimal editor
  loaded from `GET /api/projects/:pid/workspaces/:wid/file`
- `PUT /api/projects/:pid/workspaces/:wid/file?path=` — saves file contents
  directly (bypasses pending-change flow; immediate write)
- Dirty-state indicator; confirm before discarding unsaved changes
- MSW handler added/updated in `src/mocks/handlers.ts`:
  - `PUT /api/projects/:pid/workspaces/:wid/file` → success stub; in demo mode
    the edit is visible within the session but nothing is persisted

**Acceptance:** User can open a file, edit it, save it, and see the change
reflected in `git/status`. Demo build works end-to-end without a backend.

---

## Phase 6 — Polish & Production Readiness

**Goal:** The system is ready for daily use by a small trusted team.

### 6.1 Error Handling & Resilience

- Client-side reconnection logic for WebSocket drops (terminal and chat)
- Server-side recovery from panicking agent goroutines (recover + log)
- Graceful error messages in the UI (toast notifications or inline banners)
- LLM API error propagation as `{ "type": "error" }` WebSocket frames

### 6.2 Session Persistence (optional)

- Embed SQLite (`mattn/go-sqlite3` or `modernc.org/sqlite` for CGo-free builds)
- Persist agent session history and pending changes across server restarts
- Config flag to opt-in (`persistence.enabled: true`)

### 6.3 PWA & Mobile UX

- `manifest.json` and service worker for installable PWA
- Responsive layout that collapses file tree behind a drawer on small screens
- Virtual keyboard awareness in the terminal (viewport resize handling on iOS/Android)
- Touch-friendly tap targets throughout

### 6.4 TLS & Deployment

- Document direct TLS configuration (cert/key)
- Document reverse-proxy setup (nginx / Caddy example)
- Provide a sample `systemd` unit file
- Dockerfile for containerised deployment (optional)

### 6.5 Observability

- Structured JSON request logging (method, path, status, latency, user)
- Health-check endpoint `GET /healthz`
- Version endpoint `GET /api/version` returning build commit and date

---

## Testing & Validation Strategy

### Rule: Demo mode is mandatory for all frontend functionality

Every piece of frontend functionality **must** work in demo mode before it may
be merged. This is not optional. A PR that adds or modifies frontend components
without shipping the corresponding MSW handlers will be rejected.

Demo mode serves two purposes:

1. **Per-PR previews** — reviewers can interact with any UI change via the
   auto-deployed Cloudflare Pages URL without running a server.
2. **Unit testing** — the same MSW handlers are reused in Vitest tests, so
   there is one source of truth for mock behaviour.

### Pattern: Mock Service Worker (MSW)

The project uses [Mock Service Worker](https://mswjs.io/) as the seam between
real backend calls and demo/test stubs. MSW intercepts `fetch` and WebSocket
calls at the browser's Service Worker layer, which means:

- Component code is identical in real mode and demo mode — no `if (demo)`
  branches in components or hooks.
- Handlers live in one place (`src/mocks/handlers.ts`) and are reused by both
  the in-browser demo and Vitest unit tests.
- Adding support for a new API endpoint means adding one handler; there is no
  parallel service-layer abstraction to maintain.

**File layout:**

```text
client/src/mocks/
  handlers.ts      # All MSW request/WebSocket handlers
  browser.ts       # MSW browser worker setup (startWorker())
  server.ts        # MSW Node.js server setup for Vitest (setupServer())
```

**Enabling demo mode:**

In `client/src/main.tsx`:

```ts
if (import.meta.env.VITE_DEMO_MODE === 'true') {
  const { startWorker } = await import('./mocks/browser')
  await startWorker()
}
```

The `VITE_DEMO_MODE` variable is set to `'true'` only in the CI demo build and
local `npm run demo` convenience script. It is never set in the production build.

**Handler conventions:**

- HTTP handlers use `http.get`, `http.post`, `http.put`, `http.delete` from
  `msw`.
- WebSocket handlers use `ws` from `msw` (requires `msw` ≥ 2.x).
- Mock data is deterministic and minimal — just enough to exercise the UI flow.
- Delay utilities (`delay()` from `msw`) may be used to simulate realistic
  latency (e.g. a 200–400 ms delay on the workspace list, token-by-token
  streaming on chat).

**Demo-specific UI:**

- A persistent banner `DemoBanner` component, rendered at the root of the app
  when `VITE_DEMO_MODE` is `'true'`, reads **"Demo mode — no data is saved"**.
- `LoginPage` in demo mode uses a static-password form (Phase 1.4 only):
  entering the password `demo` navigates into the app; any other input shows an
  inline error message. No network call is made — the SPA runs completely
  without a backend during this phase because it is deployed only to
  Cloudflare Pages and the Go-embedded HTML templates still serve the real
  `/login` and `/` routes. In Phase 1.5, the password form is replaced by a
  "Try Demo" button that navigates directly to `ProjectListPage`.

### PR Preview Deployments

The `dev-console` Cloudflare Pages project is configured to use
`make site-build-with-demo` as its build command (`site/public` as the output
directory). Cloudflare Pages' native GitHub integration takes care of the rest:

1. On every PR commit, Cloudflare Pages runs `make site-build-with-demo`.
2. If `client/` exists, the target builds the SPA with `VITE_DEMO_MODE=true` and
   `--base /demo/`, copies the output to `site/static/demo/`, then runs Hugo to
   produce `site/public/` with the documentation **and** the demo at `/demo/`.
3. If `client/` does not yet exist (or has no `package.json`), the guard in
   `make site-build-with-demo` is a no-op and only the Hugo docs are built and
   deployed.
4. Cloudflare Pages posts a deployment status with the preview URL directly on
   the PR. The demo is accessible at `<preview-url>/demo/`.

No GitHub Actions workflow or repository secrets are required for deployments.

PRs that include user-visible UI changes **must** include a screenshot or screen
recording taken from the `<preview-url>/demo/` Cloudflare Pages URL in the PR
description.

### Acceptance Gate (applies to every phase with frontend work)

A phase is not done until all of the following hold:

1. `VITE_DEMO_MODE=true npm run build` succeeds with no errors or warnings.
2. `npm run preview` (or the Cloudflare Pages URL) shows a fully functional demo
   covering all UI flows introduced in the phase — no backend required.
3. `npm test` (Vitest) passes; tests exercise components using the same MSW
   handlers as the demo.
4. Cloudflare Pages posts a preview URL on the PR with the demo accessible at
   `<preview-url>/demo/`.

---

## Dependency Map

```text
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
              │                          │
              └──────────────────────────┘
                 (file APIs reused by agent tools)
Phase 6 can be worked on incrementally alongside Phase 4 and 5.
```

Phase 1 is a hard prerequisite for everything else because it establishes:

- The Go module and server structure all other packages plug into
- The authentication middleware that guards every API route
- The project registry and workspace store that scope all subsequent resources
- The client shell and build pipeline that all UI components extend

---

## Work Sizing Guidance

| Phase | Estimated Effort | Primary Risk |
|-------|-----------------|--------------|
| 1 | ~3–4 days | OAuth flow edge cases; PTY on macOS vs Linux |
| 2 | ~1–2 days | Path-traversal validation; large binary files |
| 3 | ~2–3 days | LLM streaming; tool-call parsing across providers |
| 4 | ~2–3 days | Diff rendering; atomic file writes |
| 5 | ~1–2 days | Command sandboxing; editor UX |
| 6 | ~2–3 days | PWA quirks on iOS; SQLite CGo build |

Estimates assume a single focused engineer. They grow if providers other than
OpenAI are tested simultaneously.

---

## Definition of Done for Each Phase

1. `make build` succeeds with no warnings.
2. `make test` passes with no failures.
3. The acceptance criteria listed in each section are manually verified.
4. **For phases with frontend work:** all items in the Acceptance Gate in the
   [Testing & Validation Strategy](#testing--validation-strategy) are satisfied —
   in particular, the demo build works without a backend and the `demo-preview`
   CI workflow produces a preview URL.
5. A brief entry is added to `CHANGELOG.md` describing what shipped.
