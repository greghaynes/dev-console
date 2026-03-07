---
title: "Dev Console"
type: docs
---

# Dev Console

This is a personal project for experimenting with alternative UIs designed for
AI-native development of cloud-native applications from mobile devices. Existing
options fall short: VSCode via a remote tunnel (vscode.dev) is the closest fit,
but Copilot's agent mode cannot perform workspace file operations in that
environment ([microsoft/vscode-copilot-release#11526](https://github.com/microsoft/vscode-copilot-release/issues/11526)),
and the GitHub mobile app covers issue and PR workflows but provides no terminal
or AI chat development experience.

Dev Console is an AI-chat-first development environment for software engineers
who want to develop software from mobile devices or thin web clients while the
heavy lifting runs on self-managed Linux infrastructure.

## Documentation

- [Design Document]({{< ref "/docs/design" >}}) — Product goals, architecture,
  data models, and API surface.
- [Implementation Plan]({{< ref "/docs/plan" >}}) — Phased delivery roadmap.
- [Wireframes]({{< ref "/docs/wireframes" >}}) — Low-fidelity ASCII wireframes
  for all primary screens.

## Source

[github.com/greghaynes/dev-console](https://github.com/greghaynes/dev-console)
