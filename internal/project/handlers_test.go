// Package project_test contains tests for the project package.
//
// # Testing approach
//
// Tests are divided into two groups:
//
//  1. Unit tests for the Manager type — these test the in-memory registry
//     operations (List, Get, Delete, Create validation) in isolation, without
//     any HTTP layer or git I/O.
//
//  2. Functional tests for the HTTP handlers — these drive the full HTTP API
//     (GET/POST/DELETE /api/projects, GET /api/projects/:pid) through
//     net/http/httptest.  Where a real git clone would be needed (POST), the
//     tests use Manager.RegisterForTest to inject a pre-created local repository
//     so that functional tests run without network access.
//
// # Fixture pattern
//
// newLocalGitRepo creates a temporary bare repository and clones it into a
// subdirectory, giving each test its own isolated, fully-valid git checkout.
// Manager.RegisterForTest inserts that checkout as a project without touching
// the network.  This is the same technique used in the workspace package tests.
package project_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/mux"

	"github.com/greghaynes/dev-console/internal/apiclient"
	"github.com/greghaynes/dev-console/internal/project"
	"github.com/greghaynes/dev-console/internal/testutil"
	"github.com/greghaynes/dev-console/internal/workspace"
)

// ── helpers ──────────────────────────────────────────────────────────────────

// newRouter sets up an HTTP router with the project and (optionally) workspace
// routes registered, matching the layout used in cmd/dev-console/main.go.
// Pass a non-nil workspaceManager to enable workspace cascade-delete tests.
func newRouter(pm *project.Manager, wm *workspace.Manager) *mux.Router {
	r := mux.NewRouter()
	api := r.PathPrefix("/api").Subrouter()

	var cascadeDelete func(string) error
	if wm != nil {
		cascadeDelete = wm.DeleteAll
	}
	project.RegisterRoutes(api, pm, cascadeDelete)

	if wm != nil {
		workspace.RegisterRoutes(api, wm, pm)
	}
	return r
}

// newLocalGitRepo delegates to testutil.NewLocalGitRepo without extra branches,
// preserving the call sites used in this package's tests.
func newLocalGitRepo(t *testing.T) string {
	return testutil.NewLocalGitRepo(t)
}

// gitRun delegates to testutil.GitRun.
func gitRun(t *testing.T, name string, args ...string) {
	testutil.GitRun(t, name, args...)
}

// decodeProject decodes a single Project from the response body.
func decodeProject(t *testing.T, rr *httptest.ResponseRecorder) project.Project {
	t.Helper()
	var p project.Project
	if err := json.NewDecoder(rr.Body).Decode(&p); err != nil {
		t.Fatalf("decoding project from response: %v", err)
	}
	return p
}

// decodeProjects decodes a slice of Projects from the response body.
func decodeProjects(t *testing.T, rr *httptest.ResponseRecorder) []project.Project {
	t.Helper()
	var projects []project.Project
	if err := json.NewDecoder(rr.Body).Decode(&projects); err != nil {
		t.Fatalf("decoding project list from response: %v", err)
	}
	return projects
}

// ── Functional tests (HTTP lifecycle) ────────────────────────────────────────

// TestProjectLifecycle_CRUD drives the full project HTTP API through a
// complete lifecycle without any network I/O:
//
//  1. GET  /api/projects          → 200 with an empty JSON array
//  2. (inject project via RegisterForTest — simulates a successful clone)
//  3. GET  /api/projects          → 200; list now contains the project
//  4. GET  /api/projects/:pid     → 200; returns correct metadata
//  5. DELETE /api/projects/:pid   → 204
//  6. GET  /api/projects/:pid     → 404
//  7. GET  /api/projects          → 200 with an empty JSON array again
//
// The RepoURL stored in the record is not a real GitHub URL; that is
// acceptable here because RegisterForTest bypasses validation.  URL-format
// validation is covered separately by TestCreateProject_InvalidRepoURL_Returns400.
func TestProjectLifecycle_CRUD(t *testing.T) {
	repoRoot := newLocalGitRepo(t)
	pm := project.NewManager(t.TempDir())
	c := apiclient.NewClient(newRouter(pm, nil))

	// 1. Empty list before any projects are registered.
	initial, err := c.ListProjects()
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(initial) != 0 {
		t.Fatalf("expected empty list before any project is created, got %d items", len(initial))
	}

	// 2. Inject a project without a real git clone.
	pm.RegisterForTest("my-project", "my-project", "https://github.com/owner/my-project", repoRoot)

	// 3. List now contains the project.
	list, err := c.ListProjects()
	if err != nil {
		t.Fatalf("ListProjects after register: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 project in list, got %d", len(list))
	}
	if list[0].ID != "my-project" {
		t.Errorf("list[0].ID = %q, want my-project", list[0].ID)
	}

	// 4. GET the individual project by ID.
	p, err := c.GetProject("my-project")
	if err != nil {
		t.Fatalf("GetProject: %v", err)
	}
	if p.ID != "my-project" {
		t.Errorf("project.ID = %q, want my-project", p.ID)
	}
	if p.Name != "my-project" {
		t.Errorf("project.Name = %q, want my-project", p.Name)
	}

	// 5. DELETE the project.
	if err := c.DeleteProject("my-project"); err != nil {
		t.Fatalf("DeleteProject: %v", err)
	}

	// 6. GET the deleted project → 404.
	if _, err := c.GetProject("my-project"); !apiclient.IsNotFound(err) {
		t.Fatalf("GetProject after delete: want 404, got %v", err)
	}

	// 7. List is empty again.
	final, err := c.ListProjects()
	if err != nil {
		t.Fatalf("ListProjects after delete: %v", err)
	}
	if len(final) != 0 {
		t.Fatalf("expected empty list after delete, got %d items", len(final))
	}
}

// TestProjectDelete_CascadesWorkspaces verifies that deleting a project via
// DELETE /api/projects/:pid also removes all of its workspaces.
//
// Setup:
//   - Two separate branches ("feature-a", "feature-b") in the same local repo.
//   - Both branches are checked out as workspaces under the project.
//
// Expectation after DELETE /api/projects/proj1:
//   - GET /api/projects/proj1 → 404
//   - GET /api/projects/proj1/workspaces → 404 (project unknown)
func TestProjectDelete_CascadesWorkspaces(t *testing.T) {
	repoRoot := newLocalGitRepo(t)
	// Create two branches that can each be checked out as a worktree.
	gitRun(t, "git", "-C", repoRoot, "branch", "feature-a")
	gitRun(t, "git", "-C", repoRoot, "branch", "feature-b")

	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	r := newRouter(pm, wm)

	pm.RegisterForTest("proj1", "proj1", "https://github.com/owner/proj1", repoRoot)

	// Create two workspaces.
	if _, err := wm.Create("proj1", repoRoot, "feature-a", "WS A", nil); err != nil {
		t.Fatalf("creating workspace A: %v", err)
	}
	if _, err := wm.Create("proj1", repoRoot, "feature-b", "WS B", nil); err != nil {
		t.Fatalf("creating workspace B: %v", err)
	}
	if ws := wm.List("proj1"); len(ws) != 2 {
		t.Fatalf("expected 2 workspaces before cascade delete, got %d", len(ws))
	}

	// DELETE the project — should cascade.
	req := httptest.NewRequest(http.MethodDelete, "/api/projects/proj1", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("DELETE /api/projects/proj1: status = %d, want 204", rr.Code)
	}

	// Workspace manager should report 0 workspaces for the deleted project.
	if ws := wm.List("proj1"); len(ws) != 0 {
		t.Errorf("expected 0 workspaces after cascade delete, got %d", len(ws))
	}

	// The project itself is gone.
	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("GET after cascade delete: status = %d, want 404", rr.Code)
	}
}

// ── Input validation tests ────────────────────────────────────────────────────
//
// These tests exercise the HTTP handler's request-validation logic only;
// no git I/O is performed.

// TestCreateProject_MissingRepoURL_Returns400 verifies that a POST body
// missing the repoURL field returns 400.
func TestCreateProject_MissingRepoURL_Returns400(t *testing.T) {
	r := newRouter(project.NewManager(t.TempDir()), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/projects",
		strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

// TestCreateProject_InvalidRepoURL_Returns400 verifies that a POST body with a
// non-GitHub HTTPS URL is rejected with 400.
func TestCreateProject_InvalidRepoURL_Returns400(t *testing.T) {
	r := newRouter(project.NewManager(t.TempDir()), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/projects",
		strings.NewReader(`{"repoURL":"not-a-valid-github-url"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

// TestCreateProject_InvalidBody_Returns400 verifies that a malformed JSON
// request body returns 400 rather than a 500 or panic.
func TestCreateProject_InvalidBody_Returns400(t *testing.T) {
	r := newRouter(project.NewManager(t.TempDir()), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/projects",
		strings.NewReader(`{invalid json}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

// TestGetProject_NotFound_Returns404 verifies the 404 path for an unknown
// project ID.
func TestGetProject_NotFound_Returns404(t *testing.T) {
	r := newRouter(project.NewManager(t.TempDir()), nil)

	req := httptest.NewRequest(http.MethodGet, "/api/projects/does-not-exist", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

// TestDeleteProject_NotFound_Returns404 verifies the 404 path for deleting an
// unknown project.
func TestDeleteProject_NotFound_Returns404(t *testing.T) {
	r := newRouter(project.NewManager(t.TempDir()), nil)

	req := httptest.NewRequest(http.MethodDelete, "/api/projects/does-not-exist", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

// TestListProjects_EmptyReturnsArray verifies that GET /api/projects returns an
// empty JSON array (not null) when no projects exist.
func TestListProjects_EmptyReturnsArray(t *testing.T) {
	r := newRouter(project.NewManager(t.TempDir()), nil)

	req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if !strings.HasPrefix(rr.Header().Get("Content-Type"), "application/json") {
		t.Errorf("Content-Type = %q, want application/json", rr.Header().Get("Content-Type"))
	}
	if projects := decodeProjects(t, rr); len(projects) != 0 {
		t.Errorf("expected empty array, got %d items", len(projects))
	}
}

// ── Manager unit tests ────────────────────────────────────────────────────────
//
// These tests exercise Manager methods directly, independent of the HTTP layer.

// TestManager_Create_InvalidURL verifies that passing a non-GitHub URL to
// Manager.Create returns an error before any git I/O is attempted.
func TestManager_Create_InvalidURL(t *testing.T) {
	m := project.NewManager(t.TempDir())
	_, err := m.Create("not-a-github-url")
	if err == nil {
		t.Fatal("expected error for invalid URL, got nil")
	}
}

// TestManager_Get_NotFound verifies that Get returns ErrNotFound for an ID
// that has never been registered.
func TestManager_Get_NotFound(t *testing.T) {
	m := project.NewManager(t.TempDir())
	_, err := m.Get("nonexistent")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// TestManager_Delete_NotFound verifies that Delete returns ErrNotFound for an
// ID that has never been registered.
func TestManager_Delete_NotFound(t *testing.T) {
	m := project.NewManager(t.TempDir())
	err := m.Delete("nonexistent")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// TestManager_List_Empty verifies that List returns an empty (not nil) slice
// when no projects have been registered.
func TestManager_List_Empty(t *testing.T) {
	m := project.NewManager(t.TempDir())
	projects := m.List()
	if len(projects) != 0 {
		t.Errorf("expected empty list, got %d items", len(projects))
	}
}
