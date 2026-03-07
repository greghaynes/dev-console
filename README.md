# Dev Console

This is a personal project for experimenting with alternative UIs designed for
AI-native development of cloud-native applications from mobile devices. Existing
options fall short: VSCode via a remote tunnel (vscode.dev) is the closest fit,
but Copilot's agent mode cannot perform workspace file operations in that
environment ([microsoft/vscode-copilot-release#11526](https://github.com/microsoft/vscode-copilot-release/issues/11526)),
and the GitHub mobile app covers issue and PR workflows but provides no terminal
or AI chat development experience.

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

> **Note:** The project is under active development. The build tooling and
> example config described below are planned as part of Phase 1 (see
> [docs/PLAN.md](docs/PLAN.md)) and are not yet available in the repository.

Once Phase 1 is complete, the intended workflow will be:

1. **Create a GitHub OAuth App** and note the client ID / secret.
2. **Create a config file** based on the **Configuration** section below and
   fill in your values.
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

## Documentation

- [Design Document](docs/DESIGN.md)
- [Implementation Plan](docs/PLAN.md)
- [Wireframes](docs/WIREFRAMES.md)

## Docs Site

The `site/` directory contains a [Hugo](https://gohugo.io/) static site built
from the docs above, deployable to either
[Cloudflare Pages](https://pages.cloudflare.com/) or
[Cloudflare Workers](https://workers.cloudflare.com/).

```sh
make site-serve   # serve locally with live reload
make site-build   # build static output to site/public/
```

### Cloudflare Pages

Connect the repository to Cloudflare Pages via the dashboard and set these
build settings (root directory: `site`):

| Setting | Value |
|---------|-------|
| Build command | `hugo --minify` |
| Build output directory | `public` |
| `HUGO_VERSION` | `0.146.0` |

### Cloudflare Workers

The root `wrangler.toml` configures the site for deployment as a
[Cloudflare Worker with Static Assets](https://developers.cloudflare.com/workers/static-assets/).
This approach gives you full Workers programmability on top of the static site
if needed in the future.

**Prerequisites:**

```sh
npm install -g wrangler   # install the Wrangler CLI
wrangler login            # authenticate with your Cloudflare account
```

**Deploy:**

```sh
wrangler deploy           # builds the site and publishes the Worker
```

Wrangler runs `make site-build` (configured in `wrangler.toml`) before
uploading, so no separate build step is needed. On first deploy, Wrangler
creates the Worker in your Cloudflare account using the `name` defined in
`wrangler.toml` (`dev-console-site`). Subsequent `wrangler deploy` calls
update the existing deployment.

To preview the Worker locally before deploying:

```sh
wrangler dev
```

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

This project is licensed under the [MIT License](LICENSE).
