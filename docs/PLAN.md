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

### 1.3 Auth Validation Site

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

### 1.4 Demo Login Page

The earliest deliverable with a previewable frontend: a minimal Vite + React +
TypeScript SPA that renders only the `LoginPage`. This phase ships the entire
demo-mode infrastructure and the per-PR CI preview workflow before any real
backend plumbing beyond auth exists.

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

**Per-PR Cloudflare Pages deployment:**

- `.github/workflows/demo-preview.yml` runs on every PR that touches `client/`
- Builds with `VITE_DEMO_MODE=true` and deploys `client/dist` to the
  `dev-console-demo` Cloudflare Pages project
- Cloudflare Pages posts a preview URL as a deployment status comment
- Required repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

**Acceptance:**

1. `VITE_DEMO_MODE=true npm run build` produces a static bundle with no server
   dependency.
2. `npm run preview` shows the login page; entering `demo` as the password
   navigates to the placeholder page; entering anything else shows an error.
3. A PR that modifies `client/` triggers the `demo-preview` workflow and a
   Cloudflare Pages preview URL appears in the PR.

### 1.5 Workspace Registration

- `internal/workspace/` package — `Workspace` struct, in-memory registry loaded
  from config
- `GET /api/workspaces` — returns the list of registered workspaces (id, name)
- `GET /api/workspaces/:id` — returns metadata for a single workspace; 404 if
  unknown

**Acceptance:** Config lists one workspace; `curl /api/workspaces` returns it as
JSON.

### 1.6 Terminal Backend

- `internal/terminal/` package
  - `Session` — wraps a `creack/pty` PTY + `exec.Cmd` (shell) + mutex-protected
    reference count; shell starts with `cwd` set to the workspace root
  - `Manager` — creates, retrieves, and destroys terminal sessions; enforces
    per-workspace session limit (initially unlimited)
- REST endpoints (behind `RequireAuth`):
  - `POST /api/workspaces/:id/terminals` → `{ terminalId }`
  - `DELETE /api/workspaces/:id/terminals/:tid`
- WebSocket endpoint `WS /api/workspaces/:id/terminals/:tid`:
  - Reads JSON `{ "type": "resize", "cols": N, "rows": N }` control frame on
    connect; subsequent binary/text frames are raw PTY stdin
  - Pumps PTY stdout as binary WebSocket frames to the client
  - Cleans up PTY on WebSocket close

**Acceptance:** `websocat` or a small test harness can attach to the WebSocket,
send resize + input, and receive shell output.

### 1.7 Minimal Web Client

A React + TypeScript SPA (bootstrapped with Vite) that provides exactly:

- `LoginPage` — shows a "Sign in with GitHub" button; shown when the user has no
  valid session
- `WorkspaceListPage` — lists available workspaces; fetched from
  `GET /api/workspaces`
- `TerminalPage` — creates a terminal session, opens the WebSocket, and renders
  an `xterm.js` `Terminal` instance attached to it; sends resize events when the
  window resizes; cleans up on unmount

The compiled SPA is embedded in the Go binary via `go:embed` and served from `/`.

Styling is minimal — Tailwind CSS with a dark theme matching a terminal aesthetic.
No design polish is required at this stage.

**Demo mode is a first-class deliverable of this phase, not an afterthought.**
MSW handlers for every new endpoint must be committed alongside the components —
not in a follow-up PR. See the
[Testing & Validation Strategy](#testing--validation-strategy) for the full
pattern.

**Demo mode for this phase** (extends the handlers from Phase 1.4):

- Add to `src/mocks/handlers.ts`:
  - `GET /api/workspaces` → two hard-coded workspaces (`demo-web`, `demo-api`)
  - `GET /api/workspaces/:id` → metadata for the matching workspace
  - WebSocket `WS /api/workspaces/:id/terminals/:tid` → in-process echo handler
    that prints a welcome banner and echoes input; no system processes are
    spawned
  - `POST /api/workspaces/:id/terminals` → returns `{ terminalId: "demo-term" }`
- Update `LoginPage` in demo mode: replace the password form from Phase 1.4 with
  a "Try Demo" button that navigates directly to `WorkspaceListPage` (no
  password prompt needed once the full flow is wired up)

**Per-PR Cloudflare Pages deployment** is already active from Phase 1.4 — this
phase's changes will automatically trigger a preview.

**Acceptance:** The full flow works in Chrome and Safari on both desktop and a
375 px wide mobile viewport:

1. `VITE_DEMO_MODE=true npm run build` produces a static bundle with no server
   dependency.
2. `npm run preview` shows the demo banner and the full flow (login → workspace
   list → open terminal → interactive echo session) without any backend.
3. The `demo-preview` CI workflow produces a Cloudflare Pages preview URL for
   the PR.
4. Against a real server (no `VITE_DEMO_MODE`): login → workspace list → open
   terminal → interactive shell session.

### Phase 1 Deliverables

| Artifact | Description |
|----------|-------------|
| `go.mod` | Go module definition |
| `cmd/dev-console/` | Server entry point |
| `internal/config/` | Config loading |
| `internal/auth/` | GitHub OAuth + session middleware |
| `internal/templates/` | `html/template` files (embedded via `go:embed`) for the auth validation site |
| `internal/workspace/` | Workspace registry |
| `internal/terminal/` | PTY session management |
| `client/` | Vite + React + TypeScript SPA (bootstrapped in Phase 1.4) |
| `client/src/mocks/` | MSW handlers and browser/server worker entry points (created in Phase 1.4) |
| `docs/examples/dev-console.yaml.example` | Annotated sample configuration |
| `Makefile` | `make build`, `make dev`, `make test` targets |
| `.github/workflows/demo-preview.yml` | Per-PR Cloudflare Pages preview deployment (created in Phase 1.4) |

---

## Phase 2 — File Browsing

**Goal:** Users can browse the workspace file tree and read file contents in the
browser.

### 2.1 File API

Add to `internal/workspace/`:

- `GET /api/workspaces/:id/files?path=<dir>` — returns a JSON list of directory
  entries (name, type, size, modTime) for `path`; defaults to workspace root
- `GET /api/workspaces/:id/file?path=<file>` — returns raw file contents

Both endpoints validate that the resolved path does not escape the workspace root
(path-traversal protection).

**Acceptance:** `curl` returns directory listings and file contents; requests for
paths outside the root return 400.

### 2.2 File Browser UI

- `FileTree` component — collapsible tree loaded lazily one directory at a time
  via `GET /api/workspaces/:id/files`
- `FileViewer` component — displays file contents with syntax highlighting
  (`highlight.js`)
- `WorkspacePage` — split layout: file tree on the left, viewer/terminal on the
  right; terminal from Phase 1 is accessible via a tab or panel
- MSW handlers added/updated in `src/mocks/handlers.ts` for all new endpoints:
  - `GET /api/workspaces/:id/files` → a small hard-coded directory tree
  - `GET /api/workspaces/:id/file` → a few sample source files

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
  - `Manager` — CRUD for sessions scoped to a workspace
- REST endpoints:
  - `GET /api/workspaces/:id/sessions`
  - `POST /api/workspaces/:id/sessions`
  - `DELETE /api/workspaces/:id/sessions/:sid`
  - `GET /api/workspaces/:id/sessions/:sid/messages`
- WebSocket `WS /api/workspaces/:id/sessions/:sid/chat`
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
  - `GET /api/workspaces/:id/sessions` → empty list initially
  - `POST /api/workspaces/:id/sessions` → returns a new session stub
  - WebSocket `WS /api/workspaces/:id/sessions/:sid/chat` → scripted handler
    that emits a fixed sequence of `assistant_chunk` frames followed by
    `assistant_done`, simulating a real streaming turn

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
  - `GET /api/workspaces/:id/sessions/:sid/changes`
  - `POST /api/workspaces/:id/sessions/:sid/changes/:cid/accept` — atomically
    writes file and marks change accepted
  - `POST /api/workspaces/:id/sessions/:sid/changes/:cid/reject` — marks change
    rejected without touching the file

**Acceptance:** Agent proposes a change; the in-memory store holds it; accept
endpoint writes the file.

### 4.2 Git Status & Diff API

- `GET /api/workspaces/:id/git/status` — runs `git status --porcelain` and
  returns structured JSON
- `GET /api/workspaces/:id/git/diff?path=` — returns unified diff for the given
  path (or all changes if path omitted)

**Acceptance:** After accepting a change, `git/status` reflects the modification.

### 4.3 Diff Review UI

- Badge on changed files in the `FileTree`
- `DiffViewer` component (using `react-diff-viewer`) for side-by-side or unified
  view
- Accept / Reject buttons per pending change
- `ChangesPanel` listing all pending changes for the session
- MSW handlers added/updated in `src/mocks/handlers.ts` for all new endpoints:
  - `GET /api/workspaces/:id/sessions/:sid/changes` → one pre-seeded pending
    change that modifies a file in the demo file tree
  - `POST …/changes/:cid/accept` and `…/changes/:cid/reject` → success stubs
  - `GET /api/workspaces/:id/git/status` → single modified file matching the
    pending change
  - `GET /api/workspaces/:id/git/diff` → a small hard-coded unified diff

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
  loaded from `GET /api/workspaces/:id/file`
- `PUT /api/workspaces/:id/file?path=` — saves file contents directly (bypasses
  pending-change flow; immediate write)
- Dirty-state indicator; confirm before discarding unsaved changes
- MSW handler added/updated in `src/mocks/handlers.ts`:
  - `PUT /api/workspaces/:id/file` → success stub; in demo mode the edit is
    visible within the session but nothing is persisted

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
- `LoginPage` in demo mode renders a "Try Demo" button that navigates directly
  to `WorkspaceListPage` without triggering the GitHub OAuth redirect.

### PR Preview Deployments

The `.github/workflows/demo-preview.yml` workflow runs on every PR that touches
`client/`. It:

1. Installs Node.js dependencies (`npm ci`).
2. Builds the SPA with `VITE_DEMO_MODE=true` (`npm run build`).
3. Deploys `client/dist` to the `dev-console-demo` Cloudflare Pages project
   using `cloudflare/pages-action`.
4. Posts the preview URL as a deployment status on the PR.

This means the first PR to introduce any frontend component automatically gets a
live preview URL — no server required.

PRs that include user-visible UI changes **must** include a screenshot or screen
recording taken from the Cloudflare Pages preview URL in the PR description.

### Acceptance Gate (applies to every phase with frontend work)

A phase is not done until all of the following hold:

1. `VITE_DEMO_MODE=true npm run build` succeeds with no errors or warnings.
2. `npm run preview` (or the Cloudflare Pages URL) shows a fully functional demo
   covering all UI flows introduced in the phase — no backend required.
3. `npm test` (Vitest) passes; tests exercise components using the same MSW
   handlers as the demo.
4. The `demo-preview` CI workflow completes successfully and a preview URL is
   visible in the PR.

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
- The workspace registry that scopes all subsequent resources
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
