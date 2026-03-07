---
title: "Wireframes"
weight: 30
---

# Dev Console — Low-Fidelity Wireframes

These ASCII wireframes illustrate the primary screens of the Dev Console web
application, derived from the product design document (`DESIGN.md`). Each
wireframe uses a fixed 80-column grid. Mobile views (< 768 px) are shown
separately where the layout differs significantly.

---

## Screen 1 — Login Page

The only screen shown to unauthenticated visitors. Keeps the UI minimal and
directs users immediately to GitHub OAuth.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                         (browser chrome)     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                                                                              │
│                        ┌──────────────────────┐                             │
│                        │                      │                             │
│                        │    [ logo / icon ]   │                             │
│                        │                      │                             │
│                        │    Dev Console       │                             │
│                        │                      │                             │
│                        │  Self-hosted AI dev  │                             │
│                        │  environment         │                             │
│                        │                      │                             │
│                        │  ┌────────────────┐  │                             │
│                        │  │  Sign in with  │  │                             │
│                        │  │    GitHub  ›   │  │                             │
│                        │  └────────────────┘  │                             │
│                        │                      │                             │
│                        └──────────────────────┘                             │
│                                                                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Interaction notes:**

- "Sign in with GitHub" button triggers the `/login` redirect to GitHub OAuth.
- On error (user not in allowlist) a brief inline error message is shown below
  the button.

---

## Screen 2 — Workspace Selection

Shown after successful login when the user has not yet opened a workspace.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Dev Console                                           [ @alice ▾ ] [Logout] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Workspaces                                                                 │
│   ──────────────────────────────────────────────────────────────────────    │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  my-project                                           Last used: 2h  │  │
│   │  /srv/workspaces/my-project                                      [›] │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  backend-api                                          Last used: 1d  │  │
│   │  /srv/workspaces/backend-api                                     [›] │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  frontend-app                                        Last used: 3d  │  │
│   │  /srv/workspaces/frontend-app                                    [›] │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Interaction notes:**

- Each workspace card is clickable and navigates to the main console for that
  workspace (`/workspaces/:id`).
- The list is populated via `GET /api/workspaces`.

---

## Screen 3 — Main Console Layout (Desktop)

The primary workspace view on a wide screen. Three-column layout:
file tree | chat panel | terminal/detail panel.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Dev Console › my-project          [ Chat ] [ Files ] [ Terminal ]  [@alice] │
├────────────────┬───────────────────────────────┬─────────────────────────────┤
│ FILE TREE      │ CHAT — session-1               │ TERMINAL                    │
│                │                               │                             │
│ ▾ my-project   │  ┌───────────────────────────┐│  $ ▌                        │
│   ▾ src/       │  │ assistant                 ││                             │
│     auth.go  🔴│  │ Sure, I'll refactor the   ││                             │
│     main.go    │  │ auth module to use JWT.    ││                             │
│   ▾ internal/  │  │ Reading auth.go…           ││                             │
│     jwt.go   🔴│  └───────────────────────────┘││                             │
│     util.go    │                               ││                             │
│   go.mod       │  ┌───────────────────────────┐││                             │
│   README.md    │  │ tool · read_file           ││                             │
│                │  │ path: src/auth.go          ││                             │
│                │  └───────────────────────────┘││                             │
│                │                               ││                             │
│                │  ┌───────────────────────────┐││                             │
│                │  │ change_proposed  auth.go 🔴││                             │
│                │  │ [Accept]  [Reject]         ││                             │
│                │  └───────────────────────────┘││                             │
│                │                               ││                             │
│                │  ┌───────────────────────────┐││                             │
│                │  │ You                       ││                             │
│                │  │ Refactor auth to JWT       ││                             │
│                │  └───────────────────────────┘││                             │
│                │                               ││                             │
│                │  ┌─────────────────────────┐  ││                             │
│                │  │ Type a message…         │  ││                             │
│                │  │                    [Send]│  ││                             │
│                │  └─────────────────────────┘  ││                             │
└────────────────┴───────────────────────────────┴─────────────────────────────┘
```

**Layout notes:**

- 🔴 badge on file tree items indicates a pending (unreviewed) agent change.
- Top tab bar switches between Chat, Files, and Terminal panel as the
  dominant center pane (terminal moves to the right panel or full-width).
- File tree and chat panel are always visible on desktop; terminal is
  collapsible.

---

## Screen 4 — Main Console Layout (Mobile)

On narrow screens (< 768 px) the three-column layout collapses to a
single-panel view with a bottom navigation bar.

```text
┌──────────────────────────┐
│ ‹  my-project     [@] ≡  │
├──────────────────────────┤
│                          │
│  session-1               │
│  ─────────────────────── │
│                          │
│  assistant               │
│  ┌──────────────────────┐│
│  │ Sure, I'll refactor  ││
│  │ the auth module…     ││
│  └──────────────────────┘│
│                          │
│  tool · read_file        │
│  ┌──────────────────────┐│
│  │ path: src/auth.go    ││
│  └──────────────────────┘│
│                          │
│  change_proposed 🔴      │
│  ┌──────────────────────┐│
│  │ auth.go              ││
│  │ [Accept]  [Reject]   ││
│  └──────────────────────┘│
│                          │
│  You                     │
│  ┌──────────────────────┐│
│  │ Refactor auth to JWT ││
│  └──────────────────────┘│
│                          │
│  ┌──────────────────────┐│
│  │ Type a message…      ││
│  │               [Send] ││
│  └──────────────────────┘│
├──────────────────────────┤
│  [💬 Chat] [📁 Files] [>_ Term] │
└──────────────────────────┘
```

**Layout notes:**

- Bottom nav bar switches between Chat, Files, and Terminal views.
- The hamburger `≡` opens a slide-in drawer with workspace list and session
  list.

---

## Screen 5 — Agent Chat Session (Session List Sidebar)

When multiple agent sessions exist for a workspace, a session list is shown
in a collapsible sidebar.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Dev Console › my-project          [ Chat ] [ Files ] [ Terminal ]  [@alice] │
├───────────────────┬────────────────────────────────────────────────────────  │
│ SESSIONS          │ CHAT — Refactor auth to JWT                              │
│ ──────────────── │                                                           │
│ ● Refactor auth   │  ┌────────────────────────────────────────────────────┐  │
│   (active)        │  │ assistant                                          │  │
│                   │  │ I've proposed changes to src/auth.go and           │  │
│ ○ Add unit tests  │  │ internal/jwt.go. Please review the diffs.          │  │
│   (idle)          │  └────────────────────────────────────────────────────┘  │
│                   │                                                           │
│ ○ Fix CI pipeline │  ┌────────────────────────────────────────────────────┐  │
│   (idle)          │  │ change_proposed                                    │  │
│                   │  │  src/auth.go               🔴 pending              │  │
│ [ + New session ] │  │  internal/jwt.go            🔴 pending              │  │
│                   │  │                                                    │  │
│                   │  │  [ Accept All ]   [ Reject All ]                   │  │
│                   │  └────────────────────────────────────────────────────┘  │
│                   │                                                           │
│                   │  ┌────────────────────────────────────────────────────┐  │
│                   │  │ Type a message…                             [Send]  │  │
│                   │  └────────────────────────────────────────────────────┘  │
└───────────────────┴────────────────────────────────────────────────────────  ┘
```

**Interaction notes:**

- `● active` = agent is currently processing; shows a typing indicator.
- `○ idle` = session is idle and can receive new messages.
- "+ New session" calls `POST /api/workspaces/:id/sessions`.

---

## Screen 6 — Change Review / Diff View

Activated when the user clicks a pending-change badge 🔴 on a file in the
tree or in the chat panel.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Dev Console › my-project › src/auth.go                            [@alice]  │
│  ← Back to chat                                      [Accept] [Reject]       │
├─────────────────────────────────────┬────────────────────────────────────────┤
│  BEFORE                             │  AFTER                                 │
│  src/auth.go                        │  src/auth.go                           │
├─────────────────────────────────────┼────────────────────────────────────────┤
│   1  package auth                   │   1  package auth                      │
│   2                                 │   2                                    │
│   3  import (                       │   3  import (                          │
│   4      "net/http"                 │   4      "net/http"                    │
│ - 5      "encoding/base64"          │                                        │
│ - 6      "strings"                  │                                        │
│   7  )                              │   5      "github.com/golang-jwt/jwt"   │
│                                     │   6  )                                 │
│   8                                 │   7                                    │
│ - 9  func BasicAuth(r *http.Request │ + 8  func JWTAuth(r *http.Request)     │
│ -10      user, pass, ok :=          │ + 9      token, err := jwt.Parse(      │
│ -11      r.BasicAuth()              │ +10          r.Header.Get("Authoriza…  │
│ -12      if !ok { return false }    │ +11      )                             │
│ -13      return check(user, pass)   │ +12      return err == nil &&          │
│                                     │ +13          token.Valid               │
│  14  }                              │  14  }                                 │
│                                     │                                        │
├─────────────────────────────────────┴────────────────────────────────────────┤
│  ← Previous change                                          Next change →    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Interaction notes:**

- Side-by-side diff view; on narrow screens falls back to a unified diff.
- Removed lines highlighted in red (`-`); added lines in green (`+`).
- "Accept" calls `POST …/changes/:cid/accept`; "Reject" calls
  `POST …/changes/:cid/reject`.
- "← Previous change / Next change →" lets the user page through all pending
  changes without returning to the file tree.

---

## Screen 7 — File Viewer / Editor

Activated when the user clicks a file in the tree (no pending change). Shows
read-only content with syntax highlighting and an "Edit" toggle.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Dev Console › my-project › internal/util.go                       [@alice]  │
│  ← Back                                                           [ Edit ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│   1  package internal                                                        │
│   2                                                                          │
│   3  import "strings"                                                        │
│   4                                                                          │
│   5  // SanitizePath resolves a relative path against a root and             │
│   6  // returns an error if the result escapes the root directory.           │
│   7  func SanitizePath(root, rel string) (string, error) {                   │
│   8      abs := filepath.Join(root, rel)                                     │
│   9      if !strings.HasPrefix(abs, root) {                                  │
│  10          return "", fmt.Errorf("path escapes workspace root")            │
│  11      }                                                                   │
│  12      return abs, nil                                                     │
│  13  }                                                                       │
│                                                                              │
│  (syntax highlighting applied; colours omitted in wireframe)                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Edit mode** (after clicking "Edit"):

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Dev Console › my-project › internal/util.go  ✏ EDITING            [@alice]  │
│  ← Cancel                                                [Save changes]      │
├──────────────────────────────────────────────────────────────────────────────┤
│   1  package internal                                                        │
│   2                                                                          │
│   3  import "strings"                                                        │
│   4  ▌                                                                       │
│   5  // SanitizePath resolves a relative path against a root and             │
│   6  // returns an error if the result escapes the root directory.           │
│   7  func SanitizePath(root, rel string) (string, error) {                   │
│   8      abs := filepath.Join(root, rel)                                     │
│   9      if !strings.HasPrefix(abs, root) {                                  │
│  10          return "", fmt.Errorf("path escapes workspace root")            │
│  11      }                                                                   │
│  12      return abs, nil                                                     │
│  13  }                                                                       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Interaction notes:**

- Read-only view uses `GET /api/workspaces/:id/file?path=` and renders with
  syntax highlighting (library choice TBD per `DESIGN.md` §9.2 — either
  highlight.js or prism.js).
- "Edit" switches to a minimal textarea / code editor (plain `<textarea>` for
  v1; no language-server features per the Non-Goals in `DESIGN.md`).
- "Save changes" calls `PUT /api/workspaces/:id/file?path=` with the new
  content; on success returns to read-only view.

---

## Navigation & Flow Summary

```text
 /login
   │
   └─▶ /workspaces                   (workspace list)
         │
         └─▶ /workspaces/:id          (main console)
               │
               ├─▶ Chat panel         (default view)
               │     │
               │     └─▶ /workspaces/:id/sessions/:sid/changes/:cid
               │                      (diff review)
               │
               ├─▶ Files panel
               │     │
               │     └─▶ /workspaces/:id/files/:path
               │                      (file viewer / editor)
               │
               └─▶ Terminal panel     (embedded xterm.js)
```
