# Dev Console — Documentation Site

A [Hugo](https://gohugo.io/) static site built from the project's documentation
files, intended for deployment on [Cloudflare Pages](https://pages.cloudflare.com/).

## Local Development

**Prerequisites:** Hugo extended v0.146.0 or later.

```bash
# Serve locally with live reload
hugo server

# Build the static site (output to public/)
hugo --minify
```

## Deploying to Cloudflare Pages

1. Connect this repository to Cloudflare Pages (Settings → Build & Deploy).
2. Set the **root directory** to `site`.
3. Use the following build settings:

| Setting | Value |
|---------|-------|
| Framework preset | Hugo |
| Build command | `hugo --minify` |
| Build output directory | `public` |
| Environment variable `HUGO_VERSION` | `0.146.0` |

Cloudflare Pages will automatically build and deploy on every push to the
configured production branch.

## Content Structure

| File | Source |
|------|--------|
| `content/_index.md` | Site home page |
| `content/docs/design.md` | Adapted from `docs/DESIGN.md` |
| `content/docs/plan.md` | Adapted from `docs/PLAN.md` |
| `content/docs/wireframes.md` | Adapted from `docs/WIREFRAMES.md` |

To add a new page, create a Markdown file under `content/` with a YAML front
matter block:

```markdown
---
title: "My New Page"
weight: 40
---

Content here…
```

## Theme

The site uses the [Hugo Book](https://github.com/alex-shpak/hugo-book) theme,
vendored under `_vendor/` so no network access is required at build time.
