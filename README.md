# Dev Console

Dev Console is an AI-chat-first development environment designed for software
engineers who want to develop software from mobile devices or thin web clients
while the heavy lifting runs on self-managed Linux infrastructure.

The system exposes a **workspace** — a directory containing a software project
— and lets one or more AI agent sessions act on that workspace through chat.
Developers can review and accept the changes agents propose, browse files, and
interact with a terminal, all from a lightweight browser or mobile client.

## Key Features

- **AI-powered chat interface** — Copilot-style AI assistant as the primary way
  to make code changes, with full tool-call transparency.
- **Change review workflow** — Agent-proposed diffs are shown before any file is
  written to disk; accept or reject per file.
- **Integrated terminal** — Full PTY session scoped to the active workspace,
  accessible in the browser.
- **File browser & editor** — Browse directories, view files with syntax
  highlighting, and edit them directly.
- **GitHub OAuth** — Authenticate exclusively via GitHub; operator controls an
  allowlist of permitted users.
- **Mobile-ready** — Thin client designed to work well on mobile browsers and as
  a PWA.

## Quick Start

```sh
# Build the server binary
make build

# Start the server (copy dev-console.yaml.example to dev-console.yaml first)
make dev
```

## Development

```sh
make test       # run tests
make test-race  # run tests with race detector
make lint       # run golangci-lint
make vet        # run go vet
```

## Documentation

- [Design Document](docs/DESIGN.md)
- [Implementation Plan](docs/PLAN.md)
- [Wireframes](docs/WIREFRAMES.md)
