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

## Screen 2 — Project Selection

Shown after successful login. Lists existing projects and allows creating new
ones by selecting a GitHub repository.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Dev Console                                           [ @alice ▾ ] [Logout] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Projects                                            [ + New Project ]     │
│   ──────────────────────────────────────────────────────────────────────    │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  my-project                                           Last used: 2h  │  │
│   │  github.com/myorg/my-project                                     [›] │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  backend-api                                          Last used: 1d  │  │
│   │  github.com/myorg/backend-api                                    [›] │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  frontend-app                                         Last used: 3d  │  │
│   │  github.com/myorg/frontend-app                                   [›] │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Interaction notes:**

- Each project card is clickable and navigates to the workspace list for that
  project (`/projects/:pid/workspaces`).
- The list is populated via `GET /api/projects`.
- "+ New Project" opens the repository-picker dialog (Screen 2a).

---

## Screen 2a — New Project Dialog (Repository Picker)

Opened by clicking "+ New Project" on Screen 2. The UI lists the authenticated
user's GitHub repositories (from `GET /api/github/repos`) and lets the user
select one to create a project.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Dev Console                                           [ @alice ▾ ] [Logout] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Projects                                            [ + New Project ]     │
│   ──────────────────────────────────────────────────────────────────────    │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  ✕   Add Project                                                     │  │
│   │  ─────────────────────────────────────────────────────────────────   │  │
│   │                                                                      │  │
│   │  Select a repository                                                 │  │
│   │  ┌──────────────────────────────────────────────────────────────┐   │  │
│   │  │ 🔍 Filter repositories…                                      │   │  │
│   │  └──────────────────────────────────────────────────────────────┘   │  │
│   │                                                                      │  │
│   │  ┌──────────────────────────────────────────────────────────────┐   │  │
│   │  │ ○  myorg/my-project          Go · Updated 2h ago             │   │  │
│   │  │ ○  myorg/backend-api         Go · Updated 1d ago             │   │  │
│   │  │ ○  myorg/frontend-app        TypeScript · Updated 3d ago     │   │  │
│   │  │ ○  myorg/docs                Markdown · Updated 1w ago       │   │  │
│   │  └──────────────────────────────────────────────────────────────┘   │  │
│   │                                                                      │  │
│   │                                    [Cancel]  [Add Project ›]        │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Interaction notes:**

- Repository list is loaded via `GET /api/github/repos`.
- The filter input narrows the list client-side.
- Selecting a repository and clicking "Add Project ›" calls
  `POST /api/projects` with `{ "repoURL": "https://github.com/…" }`.
- The server clones the repository into `storage.projectsDir` and returns the
  new project. The dialog closes and the project list updates.

---

## Screen 2b — Workspace Selection

Shown after selecting a project. Lists workspaces (branch instances) and allows
creating a new one.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  Dev Console › my-project                             [ @alice ▾ ] [Logout] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Workspaces                                          [ + New Workspace ]   │
│   ──────────────────────────────────────────────────────────────────────    │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  main  (branch: main)                                 Last used: 2h  │  │
│   │  No PR                                                           [›] │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  feature-auth  (branch: feature/auth)                 Last used: 1d  │  │
│   │  PR #42: Add JWT authentication                                  [›] │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Interaction notes:**

- Each workspace card is clickable and navigates to the main console for that
  workspace (`/projects/:pid/workspaces/:wid`).
- The list is populated via `GET /api/projects/:pid/workspaces`.
- "+ New Workspace" opens a dialog to enter a branch name; calls
  `POST /api/projects/:pid/workspaces`.

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

## Screen 4 — Mobile Workspace — Tab Overview

On narrow screens (< 768 px) the desktop three-column layout (file tree |
chat | terminal) is replaced with a **full-screen single-panel view** driven
by a four-tab bottom navigation bar. Each tab occupies the full screen; there
is no split view. Agent sessions are surfaced as a first-class tab rather than
a sidebar.

```text
┌──────────────────────────┐
│ ‹ my-project  ● session  │  ← top bar: back, project name,
│               [@]  ≡     │    active-session indicator, avatar, drawer
├──────────────────────────┤
│                          │
│   (active panel content  │
│    — full height, scrolls│
│    independently)        │
│                          │
│                          │
│                          │
│                          │
│                          │
│                          │
│                          │
├──────────────────────────┤
│  💬      📁     ≈    >_  │  ← bottom tab bar
│ Agent  Files Changes Term│
└──────────────────────────┘
```

**Design rationale — why tabs instead of split view:**

The desktop split layout places the file tree alongside the terminal in two
columns. At 390 px this yields columns that are too narrow to read code or
operate a terminal. A single-panel tabbed approach eliminates the split
entirely: each tab delivers a full-width, fully scrollable view optimised for
its content type.

| Desktop panel          | Mobile equivalent                          |
|------------------------|--------------------------------------------|
| File tree (left col)   | **Files tab** — full-screen tree → viewer  |
| Agent chat (center)    | **Agent tab** — full-screen chat panel     |
| Pending diffs          | **Changes tab** — accept/reject list       |
| Terminal (right col)   | **Terminal tab** — full-screen xterm.js    |

---

## Screen 4a — Mobile Workspace: Agent Tab

Default tab. Shows the active agent session with the full conversation thread,
including tool calls and proposed-change cards.

```text
┌──────────────────────────┐
│ ‹ my-project  ● Refactor │
│               [@]  ≡     │
├──────────────────────────┤
│ ● Refactor auth to JWT   │  ← session header strip
│                 Agent    │    (status: active / idle)
│                working…  │
├──────────────────────────┤
│                          │
│  Refactor auth to JWT    │  ← user message (right-aligned bubble)
│                    [You] │
│                          │
│  assistant               │
│  ┌──────────────────────┐│
│  │ Sure, I'll refactor  ││  ← assistant bubble
│  │ the auth module…     ││
│  └──────────────────────┘│
│                          │
│  tool · read_file        │
│  ┌──────────────────────┐│  ← tool-call card (monospace)
│  │ path: src/auth.go    ││
│  └──────────────────────┘│
│                          │
│  change proposed 🔴      │
│  ┌──────────────────────┐│
│  │ src/auth.go  pending ││  ← proposed-change card with
│  │ [✓ Accept] [✕ Reject]││    inline Accept / Reject buttons
│  └──────────────────────┘│
│                          │
│  ┌────────────────────┐↑ │
│  │ Type a message…  ↑ │  │  ← fixed input bar at bottom
│  └────────────────────┘  │
├──────────────────────────┤
│ 💬Agent 📁Files ≈Changes │
│                   >_Term │
└──────────────────────────┘
```

**Interaction notes:**

- The session-header strip shows the active session name and a typing indicator
  ("Agent working…") when the agent is processing.
- Tapping the session name or the `≡` drawer opens the session picker.
- Proposed-change cards in the chat allow quick Accept/Reject inline; the full
  diff is available in the **Changes** tab.

---

## Screen 4b — Mobile Workspace: Files Tab

Two-level drill-down: file tree → full-screen file viewer. No split view.

```text
┌──────────────────────────┐   ┌──────────────────────────┐
│ ‹ my-project  ● Refactor │   │ ‹ my-project  ● Refactor │
│               [@]  ≡     │   │               [@]  ≡     │
├──────────────────────────┤   ├──────────────────────────┤
│ FILES          my-project │   │ ‹ Files / src/auth.go    │  ← breadcrumb
├──────────────────────────┤   │                   [Edit] │
│ ▾ src/                   │   ├──────────────────────────┤
│     auth.go           🟡 │   │  1  package auth         │
│     main.go              │   │  2                       │
│ ▾ internal/              │   │  3  import (             │
│     jwt.go            🟡 │   │  4      "net/http"       │
│     util.go              │   │  5                       │
│   go.mod                 │   │  6      jwt "github.com  │
│   README.md              │   │  7          /golang-jwt" │
│                          │   │  8  )                    │
│                          │   │  9                       │
│   (🟡 = pending change)  │   │ 10  func JWTAuth(r       │
│                          │   │     *http.Request) bool {│
│                          │   │ 11      token, err :=    │
│                          │   │         jwt.Parse(…)     │
│                          │   │ 12      return err == nil│
│                          │   │ 13  }                    │
├──────────────────────────┤   ├──────────────────────────┤
│ 💬Agent 📁Files ≈Changes │   │ 💬Agent 📁Files ≈Changes │
│                   >_Term │   │                   >_Term │
└──────────────────────────┘   └──────────────────────────┘
        File tree                      File viewer
```

**Interaction notes:**

- Tapping a file navigates to the full-screen viewer (no side-by-side split).
- The breadcrumb "‹ Files" returns to the tree.
- Files with pending agent changes show an amber dot 🟡.
- "Edit" switches to a plain `<textarea>` editor (v1; no language-server
  features).

---

## Screen 4c — Mobile Workspace: Changes Tab

Lists all pending proposed changes from agent sessions. Each card is
expandable to show a unified diff inline. Accept/Reject actions are per-file.

```text
┌──────────────────────────┐
│ ‹ my-project  ● Refactor │
│               [@]  ≡     │
├──────────────────────────┤
│ PROPOSED CHANGES  2 pend │
├──────────────────────────┤
│ PENDING REVIEW           │
│ ┌────────────────────── ┐│
│ │ src/auth.go           ││
│ │ Refactor auth to JWT  ││  ← session label
│ │ +8  −6          [›]   ││  ← tap › to expand diff
│ ├────────────────────── ┤│
│ │ - func BasicAuth(…) { ││  (expanded unified diff)
│ │ -     _, _, ok :=     ││
│ │ +  func JWTAuth(…) {  ││
│ │ +      token, err :=  ││
│ ├────────────────────── ┤│
│ │ [✓ Accept]  [✕ Reject]││
│ └────────────────────── ┘│
│ ┌────────────────────── ┐│
│ │ internal/jwt.go       ││
│ │ Refactor auth to JWT  ││
│ │ +24  −0         [›]   ││
│ │ [✓ Accept]  [✕ Reject]││
│ └────────────────────── ┘│
├──────────────────────────┤
│ 💬Agent 📁Files ≈Changes │
│                   >_Term │
└──────────────────────────┘
```

**Interaction notes:**

- Tapping a card header expands/collapses the inline unified diff.
- "Accept" calls `POST …/changes/:cid/accept`; "Reject" calls
  `POST …/changes/:cid/reject`.
- After reviewing, accepted/rejected files move to a "Reviewed" section below.
- The Changes tab badge (≈ with a counter) updates live as changes are
  reviewed.

---

## Screen 4d — Mobile Workspace: Terminal Tab

Full-screen terminal — no split. The bottom tab bar remains visible for quick
context switching.

```text
┌──────────────────────────┐
│ ‹ my-project  ● Refactor │
│               [@]  ≡     │
├──────────────────────────┤
│ TERMINAL     bash        │
├──────────────────────────┤
│ alice@dev-console:       │
│ ~/my-project$ go test    │
│     ./...                │
│ ok   …/auth     0.124s   │
│ ok   …/internal 0.031s   │
│ All tests passed.        │
│                          │
│ alice@dev-console:       │
│ ~/my-project$ ▌          │  ← blinking cursor
│                          │
│                          │
│                          │
│                          │
│                          │
│                          │
├──────────────────────────┤
│ 💬Agent 📁Files ≈Changes │
│                   >_Term │
└──────────────────────────┘
```

**Interaction notes:**

- Full-width xterm.js terminal, no adjacent panels.
- The tab bar does **not** overlap the terminal viewport; xterm.js resize
  events are fired whenever the tab becomes active (`active` prop pattern
  already used in `WorkspacePage`).
- Mobile keyboard pushes the tab bar up; the terminal viewport shrinks
  accordingly (`height: 100%` within the flex container).

---

## Screen 4e — Mobile Workspace: Navigation Drawer

Opened by the `≡` icon. Slides in from the left. Provides workspace switching
and agent-session management without leaving the current panel.

```text
┌────────────────┬─────────┐
│ my-project  ✕  │ (dim    │
├────────────────┤  back-  │
│ WORKSPACE      │  drop)  │
│  ⎇ main        │         │
│    main        │         │
│  ⎇ feature-auth│         │
│    feature/auth│         │
│                │         │
├────────────────┤         │
│ AGENT SESSIONS │         │
│  ● Refactor…   │         │  ← active (highlighted)
│    (active)    │         │
│  ○ Add unit…   │         │
│    (idle)      │         │
│  ○ Fix CI…     │         │
│    (idle)      │         │
│                │         │
│  + New session │         │
│                │         │
└────────────────┴─────────┘
```

**Interaction notes:**

- Tapping a workspace row navigates to that workspace (preserves tab).
- Tapping a session row switches the active session in the Agent tab.
- "+ New session" calls `POST /api/projects/:pid/workspaces/:wid/sessions`.
- Tapping the dimmed backdrop closes the drawer.

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
- "+ New session" calls `POST /api/projects/:pid/workspaces/:wid/sessions`.

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

- Read-only view uses `GET /api/projects/:pid/workspaces/:wid/file?path=` and
  renders with syntax highlighting (library choice TBD per `DESIGN.md` §10.2 —
  either highlight.js or prism.js).
- "Edit" switches to a minimal textarea / code editor (plain `<textarea>` for
  v1; no language-server features per the Non-Goals in `DESIGN.md`).
- "Save changes" calls `PUT /api/projects/:pid/workspaces/:wid/file?path=` with
  the new content; on success returns to read-only view.

---

## Navigation & Flow Summary

```text
 /login
   │
   └─▶ /projects                  (project list)
         │
         └─▶ /projects/:pid/workspaces
                                  (workspace list for project)
               │
               └─▶ /projects/:pid/workspaces/:wid
                                  (main console)
                     │
                     ├─▶ Chat panel         (default view)
                     │     │
                     │     └─▶ /projects/:pid/workspaces/:wid/sessions/:sid/changes/:cid
                     │                      (diff review)
                     │
                     ├─▶ Files panel
                     │     │
                     │     └─▶ /projects/:pid/workspaces/:wid/files/:path
                     │                      (file viewer / editor)
                     │
                     └─▶ Terminal panel     (embedded xterm.js)
```
