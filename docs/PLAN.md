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
  - OAuth redirect handler (`GET /login`)
  - OAuth callback handler (`GET /callback`) — exchanges code for token, fetches
    GitHub user, sets signed HTTP-only session cookie
  - Logout handler (`POST /logout`)
  - `RequireAuth` middleware that validates the session cookie on every protected
    route; redirects unauthenticated requests to `/login`
- JWT-based stateless sessions signed with operator-supplied `sessionSecret`;
  configurable TTL (default 24 h)
- Operator-configured allowlist of GitHub login names; returns 403 for users not
  on the list

**Acceptance:** Visiting the server redirects to GitHub; after authorisation the
user lands back on the server with a valid session cookie. A user not on the
allowlist sees a 403. A `/api/whoami` endpoint returns `{ login, id }` for the
authenticated user.

### 1.3 Workspace Registration

- `internal/workspace/` package — `Workspace` struct, in-memory registry loaded
  from config
- `GET /api/workspaces` — returns the list of registered workspaces (id, name)
- `GET /api/workspaces/:id` — returns metadata for a single workspace; 404 if
  unknown

**Acceptance:** Config lists one workspace; `curl /api/workspaces` returns it as
JSON.

### 1.4 Terminal Backend

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

### 1.5 Minimal Web Client

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

**Acceptance:** The full flow works in Chrome and Safari on both desktop and a
375 px wide mobile viewport: login → workspace list → open terminal → interactive
shell session.

### Phase 1 Deliverables

| Artifact | Description |
|----------|-------------|
| `go.mod` | Go module definition |
| `cmd/dev-console/` | Server entry point |
| `internal/config/` | Config loading |
| `internal/auth/` | GitHub OAuth + session middleware |
| `internal/workspace/` | Workspace registry |
| `internal/terminal/` | PTY session management |
| `client/` | Vite + React + TypeScript SPA |
| `docs/examples/dev-console.yaml.example` | Annotated sample configuration |
| `Makefile` | `make build`, `make dev`, `make test` targets |

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

**Acceptance:** User can expand directories, click files, and read their contents.
The terminal panel remains accessible.

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

**Acceptance:** Full conversational loop visible in the browser; streaming text
appears word-by-word.

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

**Acceptance:** User can trigger a file edit via chat, review the diff, and accept
or reject it. File tree updates after acceptance.

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

**Acceptance:** User can open a file, edit it, save it, and see the change
reflected in `git/status`.

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

## Dependency Map

```
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
4. A brief entry is added to `CHANGELOG.md` describing what shipped.
