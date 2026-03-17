// Package workspace_test contains tests for the workspace package.
//
// # Testing approach
//
// Tests are divided into two groups:
//
//  1. Unit tests for the Manager type — these verify in-memory registry
//     operations (List, Get, Delete, DeleteAll) in isolation, without any
//     HTTP layer or git I/O.
//
//  2. Functional tests for the HTTP handlers and git operations — these drive
//     the full HTTP API through net/http/httptest and perform real git
//     operations (worktree add/remove) against a temporary local repository so
//     that the tests run without network access.
//
// # Fixture pattern
//
// newLocalGitRepo creates a temporary bare repository, clones it, commits an
// empty root commit, and optionally creates named branches.  Each test calls
// newLocalGitRepo independently so there are no shared mutable fixtures
// between tests.  Worktrees use branches other than "master" (the branch
// checked out in the main clone) because git does not allow a branch already
// checked out in one worktree to be checked out again in another.
package workspace_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"

	"github.com/gorilla/mux"

	"github.com/greghaynes/dev-console/internal/project"
	"github.com/greghaynes/dev-console/internal/workspace"
)

// ── helpers ──────────────────────────────────────────────────────────────────

// newRouter sets up a gorilla/mux router with workspace and project routes.
func newRouter(wm *workspace.Manager, pm *project.Manager) *mux.Router {
	r := mux.NewRouter()
	api := r.PathPrefix("/api").Subrouter()
	workspace.RegisterRoutes(api, wm, pm)
	return r
}

// newLocalGitRepo creates a temporary bare source repository, clones it into
// a subdirectory, and pushes an initial empty commit.  It returns the path to
// the clone.  Branch names in extraBranches are created from the initial
// commit so they can be checked out as git worktrees.
func newLocalGitRepo(t *testing.T, extraBranches ...string) string {
	t.Helper()
	tmp := t.TempDir()
	bare := tmp + "/source.git"
	clone := tmp + "/project"

	gitRun(t, "git", "init", "--bare", bare)
	gitRun(t, "git", "clone", bare, clone)
	gitRun(t, "git", "-C", clone, "config", "user.email", "test@test.com")
	gitRun(t, "git", "-C", clone, "config", "user.name", "Test")
	gitRun(t, "git", "-C", clone, "commit", "--allow-empty", "-m", "init")
	gitRun(t, "git", "-C", clone, "push", "origin", "master")

	for _, b := range extraBranches {
		gitRun(t, "git", "-C", clone, "branch", b)
	}
	return clone
}

// gitRun runs a git command and fails the test on error.
func gitRun(t *testing.T, name string, args ...string) {
	t.Helper()
	cmd := exec.Command(name, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("running %v: %v\noutput: %s", append([]string{name}, args...), err, out)
	}
}

// registerProject adds a local git clone to the project Manager under id,
// simulating a previously-cloned project.
func registerProject(pm *project.Manager, id, repoRoot string) {
	pm.RegisterForTest(id, id, "https://github.com/owner/"+id, repoRoot)
}

// ── Functional tests (HTTP + git) ────────────────────────────────────────────

// TestWorkspaceLifecycle_HTTP drives the workspace HTTP API through a full
// lifecycle against a real local git repository:
//
//  1. GET  /api/projects/proj1/workspaces        → 200, empty array
//  2. POST /api/projects/proj1/workspaces        → 201, workspace created
//  3. GET  /api/projects/proj1/workspaces        → 200, list contains new WS
//  4. GET  /api/projects/proj1/workspaces/:wid   → 200, correct metadata
//  5. DELETE /api/projects/proj1/workspaces/:wid → 204
//  6. GET  /api/projects/proj1/workspaces/:wid   → 404
//  7. GET  /api/projects/proj1/workspaces        → 200, empty array again
//
// The feature branch is used instead of "master" because git does not allow a
// branch already checked out in the main clone to be checked out in a worktree.
func TestWorkspaceLifecycle_HTTP(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-a")

	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	registerProject(pm, "proj1", repoRoot)
	r := newRouter(wm, pm)

	// 1. Empty workspace list.
	req := httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET workspaces: status = %d, want 200", rr.Code)
	}
	var initial []json.RawMessage
	if err := json.NewDecoder(rr.Body).Decode(&initial); err != nil {
		t.Fatalf("decoding initial list: %v", err)
	}
	if len(initial) != 0 {
		t.Fatalf("expected empty workspace list, got %d items", len(initial))
	}

	// 2. Create a workspace on "feature-a".
	body := `{"branch":"feature-a","name":"Feature A"}`
	req = httptest.NewRequest(http.MethodPost, "/api/projects/proj1/workspaces",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST workspaces: status = %d, want 201; body: %s", rr.Code, rr.Body.String())
	}
	var ws workspace.Workspace
	if err := json.NewDecoder(rr.Body).Decode(&ws); err != nil {
		t.Fatalf("decoding created workspace: %v", err)
	}
	if ws.ID == "" {
		t.Error("created workspace has empty ID")
	}
	if ws.Branch != "feature-a" {
		t.Errorf("Branch = %q, want feature-a", ws.Branch)
	}
	if ws.Name != "Feature A" {
		t.Errorf("Name = %q, want Feature A", ws.Name)
	}
	if ws.ProjectID != "proj1" {
		t.Errorf("ProjectID = %q, want proj1", ws.ProjectID)
	}
	// RootPath must not appear in the JSON response.
	raw := rr.Body.String()
	if strings.Contains(raw, "rootPath") || strings.Contains(raw, "RootPath") {
		t.Errorf("JSON response should not contain rootPath, got: %s", raw)
	}

	wid := ws.ID

	// 3. List now contains the workspace.
	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET workspaces after create: status = %d, want 200", rr.Code)
	}
	var list []json.RawMessage
	if err := json.NewDecoder(rr.Body).Decode(&list); err != nil {
		t.Fatalf("decoding list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 workspace in list, got %d", len(list))
	}

	// 4. GET individual workspace.
	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces/"+wid, nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET workspace/%s: status = %d, want 200", wid, rr.Code)
	}
	var got workspace.Workspace
	if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
		t.Fatalf("decoding workspace: %v", err)
	}
	if got.ID != wid {
		t.Errorf("workspace.ID = %q, want %q", got.ID, wid)
	}

	// 5. DELETE the workspace.
	req = httptest.NewRequest(http.MethodDelete, "/api/projects/proj1/workspaces/"+wid, nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("DELETE workspace/%s: status = %d, want 204; body: %s", wid, rr.Code, rr.Body.String())
	}

	// 6. GET the deleted workspace → 404.
	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces/"+wid, nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("GET workspace/%s after delete: status = %d, want 404", wid, rr.Code)
	}

	// 7. List is empty again.
	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET workspaces after delete: status = %d, want 200", rr.Code)
	}
	var final []json.RawMessage
	if err := json.NewDecoder(rr.Body).Decode(&final); err != nil {
		t.Fatalf("decoding final list: %v", err)
	}
	if len(final) != 0 {
		t.Fatalf("expected empty list after delete, got %d items", len(final))
	}
}

// TestWorkspaceCreate_MissingBranch_Returns400 verifies that a POST body
// without a branch field returns 400 (even when the project exists).
func TestWorkspaceCreate_MissingBranch_Returns400(t *testing.T) {
	repoRoot := newLocalGitRepo(t)
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	registerProject(pm, "proj1", repoRoot)
	r := newRouter(wm, pm)

	req := httptest.NewRequest(http.MethodPost, "/api/projects/proj1/workspaces",
		strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

// TestWorkspaceCreate_NameDefaultsToBranch verifies that omitting the name
// field causes the workspace name to default to the branch name.
func TestWorkspaceCreate_NameDefaultsToBranch(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-b")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	registerProject(pm, "proj1", repoRoot)
	r := newRouter(wm, pm)

	req := httptest.NewRequest(http.MethodPost, "/api/projects/proj1/workspaces",
		strings.NewReader(`{"branch":"feature-b"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", rr.Code, rr.Body.String())
	}
	var ws workspace.Workspace
	if err := json.NewDecoder(rr.Body).Decode(&ws); err != nil {
		t.Fatalf("decoding workspace: %v", err)
	}
	if ws.Name != "feature-b" {
		t.Errorf("Name = %q, want feature-b (default to branch)", ws.Name)
	}
}

// ── 404 path tests ────────────────────────────────────────────────────────────
//
// These tests verify that all workspace endpoints return 404 when the parent
// project does not exist.  No git I/O is required.

func TestListWorkspaces_UnknownProject_Returns404(t *testing.T) {
	r := newRouter(workspace.NewManager(), project.NewManager(t.TempDir()))
	req := httptest.NewRequest(http.MethodGet, "/api/projects/unknown/workspaces", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

func TestCreateWorkspace_UnknownProject_Returns404(t *testing.T) {
	r := newRouter(workspace.NewManager(), project.NewManager(t.TempDir()))
	req := httptest.NewRequest(http.MethodPost, "/api/projects/unknown/workspaces",
		strings.NewReader(`{"branch":"main"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

func TestGetWorkspace_UnknownProject_Returns404(t *testing.T) {
	r := newRouter(workspace.NewManager(), project.NewManager(t.TempDir()))
	req := httptest.NewRequest(http.MethodGet, "/api/projects/unknown/workspaces/w1", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

func TestDeleteWorkspace_UnknownProject_Returns404(t *testing.T) {
	r := newRouter(workspace.NewManager(), project.NewManager(t.TempDir()))
	req := httptest.NewRequest(http.MethodDelete, "/api/projects/unknown/workspaces/w1", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

// ── Manager unit tests ────────────────────────────────────────────────────────
//
// These tests exercise Manager methods directly, independent of the HTTP layer.

// TestManager_List_Empty verifies List returns an empty (not nil) slice when no
// workspaces have been created for the given project.
func TestManager_List_Empty(t *testing.T) {
	wm := workspace.NewManager()
	ws := wm.List("some-project")
	if len(ws) != 0 {
		t.Errorf("expected empty list, got %d items", len(ws))
	}
}

// TestManager_Get_NotFound verifies Get returns an error for an ID that does
// not exist under the given project.
func TestManager_Get_NotFound(t *testing.T) {
	wm := workspace.NewManager()
	_, err := wm.Get("project", "workspace")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// TestManager_Delete_NotFound verifies Delete returns an error for an ID that
// does not exist.
func TestManager_Delete_NotFound(t *testing.T) {
	wm := workspace.NewManager()
	err := wm.Delete("project", "workspace")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// TestManager_DeleteAll_NoneExisting verifies that DeleteAll is a no-op (not
// an error) when the project has no workspaces.
func TestManager_DeleteAll_NoneExisting(t *testing.T) {
	wm := workspace.NewManager()
	if err := wm.DeleteAll("no-such-project"); err != nil {
		t.Errorf("DeleteAll on empty project should not error: %v", err)
	}
}

// TestManager_Create_MissingBranch verifies that Create returns an error when
// the branch argument is empty.
func TestManager_Create_MissingBranch(t *testing.T) {
	wm := workspace.NewManager()
	_, err := wm.Create("proj", "/some/path", "", "name", nil)
	if err == nil {
		t.Fatal("expected error for empty branch, got nil")
	}
}

// ── JSON serialisation test ───────────────────────────────────────────────────

// TestWorkspaceJSON verifies that the JSON representation of a Workspace:
//   - includes projectId (camelCase, as specified in the API design)
//   - excludes rootPath (a server-internal detail not exposed to clients)
func TestWorkspaceJSON(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-c")
	wm := workspace.NewManager()
	ws, err := wm.Create("proj1", repoRoot, "feature-c", "", nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	data, err := json.Marshal(ws)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	s := string(data)

	if strings.Contains(s, "rootPath") || strings.Contains(s, "RootPath") {
		t.Errorf("JSON should not contain rootPath, got: %s", s)
	}
	if !strings.Contains(s, `"projectId"`) {
		t.Errorf("JSON should contain projectId, got: %s", s)
	}
}
