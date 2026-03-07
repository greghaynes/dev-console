# Dev Console Documentation Site

This directory contains the Hugo static site configuration for the Dev Console
documentation.

## Building

Requires [Hugo extended](https://gohugo.io/installation/).

```sh
make site-build
```

The built site is output to `site/public/`. This directory is
excluded from version control (`.gitignore`).

## Content

Content is served from two sources:

- `content/` — home page and any additional site-specific pages
- `../docs/` — mounted at `docs/` in the Hugo content tree; serves DESIGN.md,
  PLAN.md, and WIREFRAMES.md

## Deployment

The site is deployed automatically via Cloudflare Pages. The build command is
`make site-build` and the publish directory is `site/public`.
