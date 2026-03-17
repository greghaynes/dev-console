---
title: "Testing Strategy"
weight: 30
---

# Dev Console — Backend Testing Strategy

This document describes the testing approach used for the Go backend of
Dev Console.  It covers how tests are structured, what each layer tests,
how to run them, and the conventions and helpers you should follow when
adding new tests.

---

## Running tests

```bash
# Run all tests (fast, no race detector)
make test

# Run all tests with the race detector (required before merging)
make test-race

# Run tests for a single package
go test ./internal/project/...
go test ./internal/workspace/...
go test ./internal/slug/...
go test ./internal/auth/...

# Run tests with verbose output (useful when debugging a single test)
go test -v ./internal/workspace/... -run TestWorkspaceLifecycle_HTTP
```

All tests must pass `make test-race` before a pull request can be merged.

---

## Test layers

Tests for the Go backend are organised into three layers.  Each layer has a
distinct scope and runs without depending on the layer above it.

### Layer 1 — Unit tests (Manager methods)

**What:** Tests that call `Manager` methods directly without any HTTP layer or
external process (no git, no network).

**Why:** Fast feedback on logic errors in data-structure operations (slug
generation, in-memory registry CRUD, error sentinel values).

**Examples:**

- `TestManager_Create_InvalidURL` — verifies the URL-validation regex rejects
  non-GitHub URLs before `git clone` is attempted.
- `TestManager_Get_NotFound` — verifies `ErrNotFound` is returned for an
  unknown ID.
- `TestManager_List_Empty` — verifies `List` returns an empty slice (not nil)
  before any items are inserted.
- `TestGenerate_UniquenessSuffix` — verifies the slug uniqueness logic appends
  `-2`, `-3`, … when the base slug is already taken.

### Layer 2 — Functional (HTTP handler) tests

**What:** Tests that create a `*mux.Router` via `project.RegisterRoutes` /
`workspace.RegisterRoutes`, then drive requests through it using
`net/http/httptest.NewRecorder` and `httptest.NewRequest`.

**Why:** Exercises the full request/response cycle (routing, request decoding,
error mapping, response encoding) without spinning up a real server.  A test
at this layer fails if a handler returns the wrong HTTP status code, a wrong
JSON shape, or an unexpected header — things unit tests can't catch.

**Examples:**

- `TestListProjects_EmptyReturnsArray` — verifies `GET /api/projects` returns
  `200` with `Content-Type: application/json` and an empty JSON array (not
  `null`) when no projects exist.
- `TestCreateProject_InvalidRepoURL_Returns400` — verifies the handler maps a
  URL-validation error from `Manager.Create` to `400 Bad Request`.
- `TestWorkspaceCreate_MissingBranch_Returns400` — verifies a missing `branch`
  field is rejected with `400`.
- `TestGetProject_NotFound_Returns404` — verifies `404` is returned for an
  unknown project ID.

### Layer 3 — Integration / lifecycle tests

**What:** End-to-end tests that drive the HTTP handlers through a complete
resource lifecycle and run real git commands (`git clone`, `git worktree
add/remove`) against a temporary local repository.

**Why:** Proves that the Manager, the HTTP handlers, and git cooperate
correctly.  A lifecycle test catches bugs that only appear when all three
interact — for example, the wrong working directory for `git worktree remove`,
or a cascade-delete that removes workspaces from memory but not from disk.

**Examples:**

- `TestProjectLifecycle_CRUD` — creates a project record, lists it, gets its
  metadata, deletes it, and verifies the list is empty and a GET returns 404.
- `TestProjectDelete_CascadesWorkspaces` — creates two worktrees, deletes the
  project, and verifies both worktrees are gone from the workspace manager.
- `TestWorkspaceLifecycle_HTTP` — creates a workspace via POST, lists it, gets
  its metadata, deletes it via DELETE, and verifies the list is empty and a
  GET returns 404.

---

## Test fixtures and helpers

### Temporary directories

Every test that touches disk uses `t.TempDir()`, which the testing package
automatically cleans up when the test exits.  Never use a hard-coded path like
`/tmp/test-proj`.

### `newLocalGitRepo` helper

Both the `project` and `workspace` test packages contain a
`newLocalGitRepo(t *testing.T, extraBranches ...string)` helper.  It:

1. Creates a bare source repository in a temp directory.
2. Clones it into a subdirectory (`/project`).
3. Commits an empty root commit and pushes it.
4. Optionally creates additional branches from the initial commit.

```go
// No extra branches — used when tests only need a valid project root.
repoRoot := newLocalGitRepo(t)

// With extra branches — used when tests need to create git worktrees.
repoRoot := newLocalGitRepo(t, "feature-a", "feature-b")
```

This gives each test a self-contained, fully-valid git repository that
exercises real git plumbing (worktree add/remove, etc.) without any network
calls.

> **Why separate branches for worktrees?**  Git does not allow a branch that
> is already checked out in the main clone to be checked out simultaneously in
> a worktree.  Tests always use branches other than `master` (e.g.
> `feature-a`) for worktree creation.

### `Manager.RegisterForTest`

`project.Manager` exposes `RegisterForTest(id, name, repoURL, rootPath)` — an
exported test helper (following the `BuildSessionCookieForTest` pattern in the
`auth` package) that inserts a project record directly into the in-memory
registry without performing URL-format validation or a git clone.

Use this in functional tests when you need a project to already exist so you
can test downstream endpoints (GET, DELETE, workspace operations) without
triggering a real `git clone`.  The `repoURL` stored in the record does not
need to be a real GitHub URL; it is only stored for informational purposes.

```go
// Example: inject a project backed by a local temporary repo.
repoRoot := newLocalGitRepo(t, "feature-a")
pm := project.NewManager(t.TempDir())
pm.RegisterForTest("my-project", "my-project", "https://github.com/owner/my-project", repoRoot)
```

---

## What is not tested here

| Concern | Where it is tested |
|---|---|
| Real GitHub OAuth token exchange | Manually against a live GitHub App; the callback handler's HTTP leg is not unit-tested because it requires live GitHub credentials. |
| JWT session cookie signing and validation | `internal/auth/auth_test.go` — uses `BuildSessionCookieForTest`. |
| Real `git clone` from GitHub | Acceptance criterion in `PLAN.md §1.7`; tested manually against the live server.  Automated tests skip it because it requires network access and valid credentials. |
| Frontend (React/TypeScript) | Vitest + MSW, documented in `PLAN.md §Testing & Validation Strategy`. |

---

## Adding tests for new packages

When adding a new internal package, follow this checklist:

1. **Unit tests** — test every exported function/method with at least one
   happy-path case and one error case.
2. **Functional tests** — if the package has HTTP handlers, add a lifecycle
   test (`Test<Resource>Lifecycle_CRUD`) that exercises every handler method in
   order.
3. **Fixture helpers** — put reusable setup logic in named helper functions in
   the `_test.go` file; avoid repeating the same 10 lines of `gitRun` calls in
   every test.
4. **No hardcoded paths** — always use `t.TempDir()` for on-disk fixtures.
5. **`ForTest` helpers** — if production code needs to be tested in a way that
   bypasses external I/O (network, git clone), add an exported `*ForTest`
   helper in the package rather than adding `if testing.Testing()` guards in
   production code.
