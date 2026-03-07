# Dev Console

An AI-chat-first development environment for software engineers who want to code
from mobile devices or thin web clients while the heavy lifting runs on
self-managed Linux infrastructure.

## Features

- **AI Agent Chat** — copilot-style chat sessions that can read and write files
  in the workspace; proposed changes are staged for review before being written
  to disk
- **Change Review** — side-by-side / unified diff view with per-file Accept /
  Reject controls
- **Terminal** — full PTY session scoped to the workspace, accessible from the
  browser
- **File Browser** — lazy-loaded file tree with syntax-highlighted viewer and
  minimal in-browser editor
- **GitHub OAuth** — authentication via GitHub OAuth; access restricted to an
  operator-configured allowlist of GitHub users
- **Mobile-friendly** — React PWA with Tailwind CSS; works on 375 px viewports

## Architecture

```
Client (React SPA / PWA)
       │  HTTPS + WebSocket
       ▼
Dev Console Server  (single Go binary)
  ├── Auth (GitHub OAuth, JWT sessions)
  ├── Workspace Manager
  ├── Agent Chat Manager  ──►  LLM API (OpenAI / Anthropic / Ollama)
  ├── Terminal Manager    ──►  PTY / shell (creack/pty)
  └── File I/O (fs, git)
```

The server embeds the compiled SPA via `go:embed` so no separate static-file
server is needed.

## Quick Start

1. **Create a GitHub OAuth App** and note the client ID / secret.
2. **Copy the example config** and fill in your values:

   ```sh
   cp dev-console.yaml.example dev-console.yaml
   $EDITOR dev-console.yaml
   ```

3. **Build and run:**

   ```sh
   make build
   ./dev-console --config dev-console.yaml
   ```

4. Open `http://localhost:8080` in a browser, sign in with GitHub, and pick a
   workspace.

## Configuration

```yaml
# dev-console.yaml
server:
  listenAddr: ":8080"
  tls:
    certFile: "/etc/dev-console/tls.crt"
    keyFile:  "/etc/dev-console/tls.key"

auth:
  github:
    clientId:     "YOUR_GITHUB_CLIENT_ID"
    clientSecret: "${GITHUB_CLIENT_SECRET}"
    callbackUrl:  "https://console.example.com/callback"
  allowedGithubUsers:
    - "alice"
  sessionSecret: "${SESSION_SECRET}"
  sessionTtl:    "24h"

llm:
  provider: "openai"          # openai | anthropic | ollama
  apiKey:   "${OPENAI_API_KEY}"
  model:    "gpt-4o"
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

Secrets are read from environment variables and are never stored in the config
file or logged.

## Development

The Makefile-based workflow (`make dev`, `make test`, `make build`) described
in the design and planning documents is not yet implemented in this
repository. Until a `Makefile` is added, please refer to the project-specific
setup and run instructions (and [docs/PLAN.md](docs/PLAN.md)) for the current
development, testing, and build process.

## Roadmap

See [docs/PLAN.md](docs/PLAN.md) for the full phased implementation plan and
[docs/DESIGN.md](docs/DESIGN.md) for the complete product design document.

| Phase | Goal |
|-------|------|
| 1 | Minimal E2E terminal (auth + workspace + PTY + React shell) |
| 2 | File browsing (tree + viewer) |
| 3 | Basic agent chat (read-only tools) |
| 4 | Change proposal & diff review |
| 5 | Full agent toolset + manual file editor |
| 6 | Polish, PWA, TLS, observability |

## Security

- All routes require a valid GitHub OAuth session.
- File paths are validated against the workspace root to prevent path traversal.
- Agent `run_command` calls are restricted to an operator-configured allowlist.
- TLS is terminated by the server (cert/key config) or a reverse proxy.
- Secrets are passed via environment variables, never in config files.

See [docs/DESIGN.md § Security Considerations](docs/DESIGN.md) for the full
threat model.

## License

See [LICENSE](LICENSE).
