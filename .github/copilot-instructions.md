# GitHub Copilot Instructions — Dev Console

Dev Console is an AI-chat-first development environment. The server is a single
Go binary that embeds a compiled React/TypeScript SPA. Understanding the
architecture and the conventions below will help Copilot generate code that fits
seamlessly into the project.

---

## Project Layout

```
cmd/dev-console/        # Server entry point (main.go)
internal/
  auth/                 # GitHub OAuth + JWT session middleware
  config/               # YAML config loading with env-var substitution
  workspace/            # Workspace registry and file I/O (Phase 2+)
  terminal/             # PTY session management (Phase 1.4+)
  llm/                  # LLM HTTP client (Phase 3+)
  agent/                # Agent session & tool execution (Phase 3+)
client/                 # Vite + React + TypeScript SPA (Phase 1.5+)
docs/
  DESIGN.md             # Full product design and threat model
  PLAN.md               # Phased implementation roadmap
  WIREFRAMES.md         # UI mockups
```

New back-end packages belong under `internal/`. New client code belongs under
`client/src/`. Keep each package focused on a single concern.

---

## Go — Back-End Best Practices

### Module and imports

- Module path: `github.com/greghaynes/dev-console`
- Go version: see `go.mod`
- Standard library first, then third-party, then internal packages — one blank
  line between each group.

### Package documentation

Every package must start with a `// Package <name> …` comment that describes
the package's purpose in one or two sentences.

### Error handling

- Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.
- Never swallow errors silently; always propagate or log them.
- Sentinel errors and error types live in the package that defines them.

### HTTP handlers

- All handlers follow the standard `http.Handler` / `http.HandlerFunc`
  signature.
- Middleware is implemented as `func(http.Handler) http.Handler`.
- User identity is stored in the request context using an unexported
  `contextKey` type (see `internal/auth/auth.go`) — never use `string` keys.
- Protected routes are registered on the gorilla/mux subrouter that has
  `RequireAuth` applied; unprotected routes (login, callback, healthz) go on
  the root router.
- Always set `Content-Type` before writing a body.
- Use `json.NewEncoder(w).Encode(v)` for JSON responses.

### Routing

- Use `gorilla/mux` for all HTTP routing.
- Register methods explicitly (`.Methods(http.MethodGet)`).
- Path parameters use gorilla/mux variables: `mux.Vars(r)["id"]`.
- The API lives under the `/api` prefix, protected by `RequireAuth`.

### WebSocket

- Use `gorilla/websocket` for all WebSocket endpoints.
- Control messages (resize, cancel) are JSON text frames.
- Data payloads (PTY bytes, chat stream chunks) are binary frames.
- Always close the connection and clean up resources when the handler returns.

### Configuration

- All configuration is loaded via `internal/config.Load(path)`.
- Secrets (OAuth client secret, session secret, LLM API key) **must** be
  referenced as `${ENV_VAR}` placeholders in the YAML file — never hard-coded
  or logged.
- Add new config fields to the appropriate `*Config` struct with a `yaml`
  struct tag. Validate required fields in `Config.validate()`.

### Security

- **Path traversal**: resolve every user-supplied file path with
  `filepath.Clean` and `filepath.Abs`, then assert that the result has the
  workspace root as a prefix. Return `http.StatusBadRequest` (400) if it does
  not.
- **Command allowlist**: the `run_command` agent tool only executes commands
  present in `cfg.LLM.AllowedCommands`. Reject anything else with an error.
- **Session cookies**: always set `HttpOnly: true`, `Secure: true`, and
  `SameSite: http.SameSiteLaxMode` (or Strict). Never store secrets in the
  cookie value itself — store only the signed JWT.
- **Authentication middleware**: every route under `/api/` must go through
  `RequireAuth`. New unauthenticated endpoints (e.g. `/healthz`) are the
  exception and must be explicitly justified.
- **No secrets in logs**: never log config values, JWTs, OAuth tokens, or API
  keys.

### Concurrency

- Protect shared mutable state with a `sync.Mutex` or `sync.RWMutex` scoped
  to the struct that owns the state.
- Pass a `context.Context` as the first argument to any function that performs
  I/O or may block.
- Use `context.WithTimeout` / `context.WithCancel` to bound long-running
  operations.

### Graceful shutdown

- The server listens for `SIGINT` / `SIGTERM` and calls `http.Server.Shutdown`
  with a 30-second context.
- Background goroutines should accept a context and return when it is
  cancelled.

### Testing

- Test files live alongside the package they test (`auth_test.go` next to
  `auth.go`).
- Use the standard `testing` package; no third-party test frameworks.
- Prefer table-driven tests for cases that vary only in input/output.
- Use `net/http/httptest` for handler tests.
- Export test-only helpers with a `ForTest` suffix (e.g.
  `BuildSessionCookieForTest`).
- Run tests with `make test` or `make test-race` (race detector enabled).

### Build

- Build with `make build` (outputs `bin/dev-console`).
- The CI pipeline runs `go vet ./...` and `make test-race`; keep both green.
- The compiled React SPA is embedded via `//go:embed` in the server binary —
  build the client before running `go build` in full integration scenarios.

---

## TypeScript / React — Front-End Best Practices

### Stack

- **Build tool**: Vite
- **Language**: TypeScript (strict mode)
- **Framework**: React (functional components + hooks only; no class components)
- **Styling**: Tailwind CSS — dark theme by default, matching a terminal
  aesthetic
- **Terminal emulator**: xterm.js
- **Diff viewer**: react-diff-viewer (or equivalent)
- **Syntax highlighting**: highlight.js or prism.js (client-side, no server
  dependency)
- **Server state**: React Query (`@tanstack/react-query`)
- **Local UI state**: Zustand

### Component conventions

- One component per file; file name matches the component name in PascalCase
  (e.g. `TerminalPage.tsx`).
- Keep components small and focused; extract sub-components when a component
  exceeds ~150 lines.
- Define prop types with TypeScript interfaces, not `type` aliases, unless a
  union or intersection is needed.

### Data fetching

- Use React Query hooks (`useQuery`, `useMutation`) for all API calls.
- Never fetch data directly inside component render; use hooks.
- API base URL is the same origin as the SPA (no CORS needed).

### WebSocket

- Manage WebSocket lifecycle inside a custom hook (e.g. `useTerminalSocket`,
  `useChatSocket`).
- Send a `{ "type": "resize", "cols": N, "rows": N }` JSON text frame on
  connect (and on window resize) before switching to binary PTY I/O.
- Clean up the WebSocket connection in the hook's cleanup function (returned
  from `useEffect`).

### Mobile and responsiveness

- All layouts must work at 375 px viewport width (mobile-first).
- Use Tailwind responsive prefixes (`sm:`, `md:`) for progressive enhancement.
- File tree and side panels collapse into a drawer on small screens.
- Test on Chrome and Safari on both desktop and a 375 px mobile viewport.

### Accessibility

- Interactive elements must be keyboard-navigable and have descriptive
  `aria-label` attributes where the visible label is absent.

---

## API Design

- REST endpoints follow the patterns in `docs/DESIGN.md §§5–7`.
- WebSocket message envelopes are JSON with a `"type"` discriminator field
  (see `docs/DESIGN.md §6.3` and `§7.2`).
- HTTP status codes: `200` success, `400` bad request / validation error,
  `401` unauthenticated, `403` forbidden, `404` not found, `502` upstream
  (GitHub / LLM) error.
- JSON field names use `camelCase`.

---

## Implementation Phasing

Follow the order in `docs/PLAN.md`. Each phase must:

1. Pass `make build` with no warnings.
2. Pass `make test` with no failures.
3. Meet the acceptance criteria listed in its section of `PLAN.md`.
4. Add an entry to `CHANGELOG.md`.

Do not start a later phase until all acceptance criteria for the current phase
are met. The guiding principle is **thin vertical slices**: ship a working,
end-to-end feature before adding breadth.

---

## What Not to Do

- Do not add new dependencies without updating `go.mod` / `go.sum` via
  `go get`.
- Do not store secrets, tokens, or credentials in source code or config files.
- Do not bypass `RequireAuth` for new API routes without an explicit reason.
- Do not perform file I/O outside the workspace root without path-traversal
  validation.
- Do not add language-server IDE features (autocomplete, inline diagnostics)
  — these are explicitly out of scope for v1 (see `docs/DESIGN.md §2`).
- Do not target multi-tenant SaaS deployment; the server is designed for a
  single operator and a small trusted team.
