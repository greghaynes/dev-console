# Dev Console — Product Design Document

## 1. Overview

Dev Console is an AI-chat-first development environment designed for software
engineers who want to develop software from mobile devices or thin web clients
while the heavy lifting runs on self-managed Linux infrastructure. The system
exposes a **workspace** — a directory containing a software project — and lets
one or more AI agent sessions act on that workspace through chat. Developers can
review and accept the changes agents propose, browse files, and interact with a
terminal, all from a lightweight browser or mobile client.

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Run entirely on self-managed Linux servers; no dependency on third-party cloud execution environments. |
| G2 | Provide a copilot-style AI chat interface as the primary way to make code changes. |
| G3 | Expose a terminal that is scoped to the active workspace. |
| G4 | Let users view, browse, and manually edit files in the workspace. |
| G5 | Present diffs of agent-proposed changes and let the user accept or reject them. |
| G6 | Authenticate users exclusively through GitHub OAuth (no separate credential store). |
| G7 | Keep the client thin enough to run well on mobile browsers. |

### Non-Goals

- A full IDE with language-server features (autocomplete, inline diagnostics, etc.) is *out of scope* for v1.
- The server does not manage its own AI model weights; it calls an external LLM API (e.g. OpenAI or Anthropic) configured by the operator.
- Multi-tenant / cloud-hosted SaaS deployment is not a design goal; each deployment serves a single user or a small trusted team.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌────────────────────┐    ┌────────────────────────────┐    │
│  │   Web App (SPA)    │    │   Mobile Browser / PWA     │    │
│  └────────┬───────────┘    └────────────┬───────────────┘    │
└───────────┼────────────────────────────┼────────────────────┘
            │  HTTPS / WebSocket         │
┌───────────▼────────────────────────────▼────────────────────┐
│                     Dev Console Server                       │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │  Auth Module │  │  REST/WS API  │  │  Static Asset    │  │
│  │ (GitHub OAuth│  │   (HTTP/2)    │  │   Serving        │  │
│  └──────────────┘  └───────┬───────┘  └──────────────────┘  │
│                            │                                 │
│  ┌─────────────────────────▼─────────────────────────────┐  │
│  │                    Core Services                       │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐   │  │
│  │  │  Workspace  │  │  Agent Chat  │  │  Terminal   │   │  │
│  │  │  Manager    │  │  Manager     │  │  Manager    │   │  │
│  │  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘   │  │
│  └─────────┼────────────────┼─────────────────┼──────────┘  │
│            │                │                 │              │
│  ┌─────────▼────────────────▼─────────────────▼──────────┐  │
│  │               Infrastructure Layer                     │  │
│  │  ┌───────────┐  ┌──────────────┐  ┌───────────────┐   │  │
│  │  │ File I/O  │  │  LLM Client  │  │  PTY / Shell  │   │  │
│  │  │ (fs, git) │  │ (HTTP client)│  │  (pty/exec)   │   │  │
│  │  └───────────┘  └──────────────┘  └───────────────┘   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

The server is a single long-running process written in **Go** (see §9). It
hosts the REST + WebSocket API and serves the compiled client SPA as static
assets from the same origin, removing CORS complexity.

---

## 4. Authentication

### 4.1 GitHub OAuth Flow

```
Client                Server                  GitHub
  │                     │                       │
  │── GET /login ───────▶│                       │
  │◀─ 302 → github.com ─│                       │
  │                     │                       │
  │── GET /callback?code=… ─────────────────────▶│
  │                     │◀── access_token ───────│
  │                     │── GET /user ───────────▶│
  │                     │◀── { login, id } ───────│
  │                     │                       │
  │◀─ Set-Cookie: session ─│                    │
```

1. The server is configured with a GitHub OAuth App `client_id` / `client_secret`.
2. `/login` redirects to GitHub's authorization page with `scope=read:user`.
3. GitHub redirects back to `/callback`; the server exchanges the code for an
   access token, fetches the user's GitHub login and numeric ID, then creates a
   signed, HTTP-only session cookie (JWT or opaque token backed by an in-memory
   or on-disk store).
4. All subsequent API calls must present this session cookie. The server
   validates it on every request.
5. An allowlist of GitHub user IDs (configured by the operator) controls who
   may access the server.

### 4.2 Session Management

- Sessions expire after a configurable idle timeout (default: 24 hours).
- Session tokens are signed with an operator-supplied secret key; no database
  is required for stateless JWT sessions.
- Logout invalidates the session cookie on the client and, if using opaque
  tokens, removes the server-side record.

---

## 5. Workspaces

A **workspace** is a directory on the server's filesystem containing a software
project. Multiple workspaces can be registered by the operator in the server
configuration.

### 5.1 Data Model

```
Workspace {
  id:         string          // URL-safe slug, e.g. "my-project"
  name:       string          // Display name
  rootPath:   string          // Absolute path on the server
  createdAt:  timestamp
}
```

### 5.2 Operations

| Operation | Description |
|-----------|-------------|
| `GET /api/workspaces` | List all registered workspaces. |
| `GET /api/workspaces/:id` | Get workspace metadata. |
| `GET /api/workspaces/:id/files?path=` | List directory contents at `path` (relative to workspace root). |
| `GET /api/workspaces/:id/file?path=` | Read file contents. |
| `PUT /api/workspaces/:id/file?path=` | Write file contents (manual edit). |
| `GET /api/workspaces/:id/git/status` | Return `git status` for the workspace. |
| `GET /api/workspaces/:id/git/diff?path=` | Return unified diff for a path. |

### 5.3 File Browsing

The client displays a file tree for the workspace root. Directories are
expanded on demand via `GET /api/workspaces/:id/files?path=<dir>`. File
contents are fetched and rendered in a read-only viewer with syntax
highlighting. A separate "edit" mode switches to a minimal text editor.

---

## 6. Agent Chat Sessions

An **agent session** is a conversation between the user and an AI copilot that
can read and write files inside the workspace.

### 6.1 Data Model

```
AgentSession {
  id:          string
  workspaceId: string
  title:       string       // Auto-generated from first user message
  createdAt:   timestamp
  updatedAt:   timestamp
  status:      "active" | "idle" | "error"
}

Message {
  id:          string
  sessionId:   string
  role:        "user" | "assistant" | "tool"
  content:     string       // Markdown text or tool-call JSON
  createdAt:   timestamp
}

PendingChange {
  id:          string
  sessionId:   string
  filePath:    string       // Relative to workspace root
  diff:        string       // Unified diff
  status:      "pending" | "accepted" | "rejected"
  createdAt:   timestamp
}
```

### 6.2 Operations

| Operation | Description |
|-----------|-------------|
| `GET /api/workspaces/:id/sessions` | List agent sessions for a workspace. |
| `POST /api/workspaces/:id/sessions` | Create a new agent session. |
| `DELETE /api/workspaces/:id/sessions/:sid` | Close/delete a session. |
| `GET /api/workspaces/:id/sessions/:sid/messages` | Fetch message history. |
| `WS /api/workspaces/:id/sessions/:sid/chat` | Bidirectional stream for chat messages and agent events. |
| `GET /api/workspaces/:id/sessions/:sid/changes` | List pending changes proposed by the agent. |
| `POST /api/workspaces/:id/sessions/:sid/changes/:cid/accept` | Apply a pending change to the workspace. |
| `POST /api/workspaces/:id/sessions/:sid/changes/:cid/reject` | Discard a pending change. |

### 6.3 WebSocket Chat Protocol

Messages over the WebSocket are JSON-encoded and follow this envelope:

```jsonc
// Client → Server
{ "type": "user_message", "content": "Refactor the auth module to use JWT" }
{ "type": "cancel" }          // Interrupt the in-flight agent turn

// Server → Client
{ "type": "assistant_chunk",  "content": "Sure, I'll start by…" }
{ "type": "assistant_done" }
{ "type": "tool_call",        "name": "read_file",   "args": { "path": "auth.go" } }
{ "type": "tool_result",      "name": "read_file",   "content": "…file contents…" }
{ "type": "change_proposed",  "changeId": "c1",      "filePath": "auth.go", "diff": "…" }
{ "type": "error",            "message": "LLM API quota exceeded" }
```

### 6.4 Agent Tool Set

The agent is given the following tools by the server (function-calling style):

| Tool | Description |
|------|-------------|
| `read_file(path)` | Read a file from the workspace. |
| `write_file(path, content)` | Propose a file change (creates a `PendingChange`; does **not** write to disk until accepted). |
| `list_files(path)` | List directory contents. |
| `run_command(cmd, args)` | Execute a shell command inside the workspace directory and return stdout/stderr. Restricted to a configurable allowlist (e.g. `go test`, `npm test`, `make`). |
| `git_diff(path?)` | Return the current git diff. |

---

## 7. Terminal

The terminal provides a full PTY session inside the workspace directory.

### 7.1 Operations

| Operation | Description |
|-----------|-------------|
| `POST /api/workspaces/:id/terminals` | Create a new terminal session; returns `{ terminalId }`. |
| `DELETE /api/workspaces/:id/terminals/:tid` | Kill the terminal. |
| `WS /api/workspaces/:id/terminals/:tid` | Attach stdin/stdout/stderr over WebSocket. |

### 7.2 WebSocket Terminal Protocol

Raw PTY bytes are forwarded over the WebSocket. The client sends resize events
as a JSON message before switching to binary mode:

```jsonc
// Client → Server (JSON control message, UTF-8 text frame)
{ "type": "resize", "cols": 220, "rows": 50 }

// After the handshake, all frames are binary (raw PTY bytes).
// Client → Server: stdin bytes
// Server → Client: stdout/stderr bytes
```

### 7.3 Security

- Each terminal is bound to a single workspace root; the shell is started with
  `cwd` set to the workspace root.
- The operator may restrict which shells are allowed (default: `bash`).
- Terminal sessions are subject to the same session authentication as all other
  API endpoints.

---

## 8. Change Review

When an agent proposes a file change it is stored as a `PendingChange`. The
user reviews proposed diffs in the client before they are written to disk.

### 8.1 Review UI Flow

1. After an agent turn completes, the client shows a badge on each changed
   file in the file tree.
2. Selecting a changed file opens a **side-by-side or unified diff view**.
3. The user clicks **Accept** or **Reject** per file.
4. Accepting calls `POST …/changes/:cid/accept`; the server atomically writes
   the new file content and records the change as accepted.
5. Rejecting calls `POST …/changes/:cid/reject`; the pending change is
   discarded and the file is left unmodified.
6. After all changes in a session are resolved the agent session returns to
   `idle` status.

---

## 9. Technology Stack

### 9.1 Server

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | Go | Single static binary; good concurrency; easy deployment. |
| HTTP framework | `net/http` + `gorilla/mux` or `chi` | Lightweight; no magic. |
| WebSocket | `gorilla/websocket` | De facto standard in the Go ecosystem. |
| PTY | `creack/pty` | Mature Go PTY library. |
| LLM client | OpenAI-compatible HTTP client | Works with OpenAI, Anthropic (via compatibility layer), or local models (Ollama). |
| Session store | JWT (`golang-jwt/jwt`) signed with operator secret | Stateless; no database required. |
| Configuration | YAML file + env variable overrides | Simple operator experience. |

### 9.2 Client

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript | Strong typing; large ecosystem. |
| Framework | React (Vite build) | Widely known; fast iteration; good mobile support. |
| Terminal emulator | `xterm.js` | Widely used; handles full VT100/VT220 escapes. |
| Diff viewer | `react-diff-viewer` or similar | Renders unified/side-by-side diffs. |
| Syntax highlighting | `highlight.js` or `prism.js` | Client-side, no server dependency. |
| Styling | Tailwind CSS | Responsive by default; small bundle. |
| State management | React Query + Zustand | Server state + local UI state. |

### 9.3 Deployment

The operator runs a single `dev-console` binary and a short configuration file:

```yaml
# dev-console.yaml
server:
  listenAddr: ":8080"
  tls:
    certFile: "/etc/dev-console/tls.crt"
    keyFile:  "/etc/dev-console/tls.key"

auth:
  github:
    clientId:     "Ov23liABCDEFGH"
    clientSecret: "${GITHUB_CLIENT_SECRET}"   # env variable
    callbackUrl:  "https://console.example.com/callback"
  allowedGithubUsers:
    - "alice"
    - "bob"
  sessionSecret: "${SESSION_SECRET}"
  sessionTtl:    "24h"

llm:
  provider:    "openai"           # or "anthropic", "ollama"
  apiKey:      "${OPENAI_API_KEY}"
  model:       "gpt-4o"
  allowedCommands:
    - "go"
    - "npm"
    - "make"
    - "git"

workspaces:
  - id:       "my-project"
    name:     "My Project"
    rootPath: "/srv/workspaces/my-project"
```

The compiled client SPA is embedded in the server binary using Go's `embed`
package so no separate static file server is needed.

---

## 10. Security Considerations

| Threat | Mitigation |
|--------|------------|
| Unauthorized access | GitHub OAuth + allowlist of GitHub user IDs. All API routes require a valid session. |
| Session hijacking | HTTP-only, Secure, SameSite=Strict cookies; short TTL with refresh. |
| Path traversal in file API | All file paths are resolved against the workspace root and rejected if the resolved path escapes it. |
| Arbitrary command execution via terminal | Terminal access is behind authentication; the operator controls which workspaces and shells are allowed. |
| Agent-triggered command execution | `run_command` tool is restricted to an operator-configured allowlist; commands run in a sandboxed subprocess with the workspace as the working directory. |
| LLM prompt injection | Agent tool outputs are escaped before being re-injected into the context; file content passed to the LLM is clearly delimited. |
| TLS | The server is expected to terminate TLS directly (cert/key configurable) or be placed behind a TLS-terminating reverse proxy. |
| Secret management | Secrets (OAuth client secret, session secret, LLM API key) are read from environment variables; they are never stored in the config file or logged. |

---

## 11. Open Questions / Future Work

- **Multi-user collaboration**: Should multiple users be able to share a
  workspace and see each other's agent sessions? (Deferred to v2.)
- **Agent sandboxing**: Should the agent's `run_command` calls run inside a
  container or VM for additional isolation? (Recommended for untrusted code.)
- **Persistent sessions**: Agent session history could be persisted to an
  embedded SQLite database so it survives server restarts.
- **Notification / async events**: A Server-Sent Events (SSE) or WebSocket
  "event bus" endpoint could push workspace change notifications to all
  connected clients in real time.
- **Mobile-native app**: A React Native app could provide a richer mobile
  experience than the PWA, particularly for the terminal.
