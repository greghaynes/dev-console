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
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gorilla/mux"

	"github.com/greghaynes/dev-console/internal/apiclient"
	"github.com/greghaynes/dev-console/internal/project"
	"github.com/greghaynes/dev-console/internal/testutil"
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

// newLocalGitRepo delegates to testutil.NewLocalGitRepo.
func newLocalGitRepo(t *testing.T, extraBranches ...string) string {
	return testutil.NewLocalGitRepo(t, extraBranches...)
}

// gitRun delegates to testutil.GitRun.
func gitRun(t *testing.T, name string, args ...string) {
	testutil.GitRun(t, name, args...)
}

// registerProject adds a local git clone to the project Manager under id,
// simulating a previously-cloned project.
func registerProject(pm *project.Manager, id, repoRoot string) {
	testutil.RegisterProject(pm, id, repoRoot)
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
	c := apiclient.NewClient(newRouter(wm, pm))

	// 1. Empty workspace list.
	initial, err := c.ListWorkspaces("proj1")
	if err != nil {
		t.Fatalf("ListWorkspaces: %v", err)
	}
	if len(initial) != 0 {
		t.Fatalf("expected empty workspace list, got %d items", len(initial))
	}

	// 2. Create a workspace on "feature-a".
	ws, err := c.CreateWorkspace("proj1", "feature-a", "Feature A")
	if err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
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

	wid := ws.ID

	// 3. List now contains the workspace.
	list, err := c.ListWorkspaces("proj1")
	if err != nil {
		t.Fatalf("ListWorkspaces after create: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 workspace in list, got %d", len(list))
	}

	// 4. GET individual workspace.
	got, err := c.GetWorkspace("proj1", wid)
	if err != nil {
		t.Fatalf("GetWorkspace: %v", err)
	}
	if got.ID != wid {
		t.Errorf("workspace.ID = %q, want %q", got.ID, wid)
	}

	// 5. DELETE the workspace.
	if err := c.DeleteWorkspace("proj1", wid); err != nil {
		t.Fatalf("DeleteWorkspace: %v", err)
	}

	// 6. GET the deleted workspace → 404.
	if _, err := c.GetWorkspace("proj1", wid); !apiclient.IsNotFound(err) {
		t.Fatalf("GetWorkspace after delete: want 404, got %v", err)
	}

	// 7. List is empty again.
	final, err := c.ListWorkspaces("proj1")
	if err != nil {
		t.Fatalf("ListWorkspaces after delete: %v", err)
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

// ── File API handler tests ─────────────────────────────────────────────────────

// TestFilesHandler_ListsDirectory verifies that GET .../files returns a JSON
// array of directory entries for the workspace root.
func TestFilesHandler_ListsDirectory(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-files")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	registerProject(pm, "proj1", repoRoot)
	r := newRouter(wm, pm)

	// Create workspace.
	body := `{"branch":"feature-files"}`
	req := httptest.NewRequest(http.MethodPost, "/api/projects/proj1/workspaces",
		strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST workspaces: status=%d body=%s", rr.Code, rr.Body.String())
	}
	var ws workspace.Workspace
	if err := json.NewDecoder(rr.Body).Decode(&ws); err != nil {
		t.Fatalf("decoding workspace: %v", err)
	}
	wid := ws.ID

	// Retrieve the workspace root from the manager to write a test file.
	got, err := wm.Get("proj1", wid)
	if err != nil {
		t.Fatalf("wm.Get: %v", err)
	}
	// Write a test file inside the worktree.
	if err := os.WriteFile(filepath.Join(got.RootPath, "hello.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("writing test file: %v", err)
	}

	// GET files endpoint.
	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces/"+wid+"/files", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET files: status=%d body=%s", rr.Code, rr.Body.String())
	}

	var entries []workspace.DirEntry
	if err := json.NewDecoder(rr.Body).Decode(&entries); err != nil {
		t.Fatalf("decoding entries: %v", err)
	}

	// hello.txt must appear.
	found := false
	for _, e := range entries {
		if e.Name == "hello.txt" && e.Type == "file" {
			found = true
		}
	}
	if !found {
		names := make([]string, len(entries))
		for i, e := range entries {
			names[i] = e.Name
		}
		t.Errorf("hello.txt not found in entries: %v", names)
	}
}

// TestFilesHandler_SubdirectoryPath verifies that passing a ?path= query
// parameter returns entries for a sub-directory.
func TestFilesHandler_SubdirectoryPath(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-subdir")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	registerProject(pm, "proj1", repoRoot)
	r := newRouter(wm, pm)

	req := httptest.NewRequest(http.MethodPost, "/api/projects/proj1/workspaces",
		strings.NewReader(`{"branch":"feature-subdir"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST workspaces: status=%d", rr.Code)
	}
	var ws workspace.Workspace
	if err := json.NewDecoder(rr.Body).Decode(&ws); err != nil {
		t.Fatalf("decode: %v", err)
	}
	got, _ := wm.Get("proj1", ws.ID)

	// Create a sub-directory with a file.
	subDir := filepath.Join(got.RootPath, "src")
	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(subDir, "main.go"), []byte("package main"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces/"+ws.ID+"/files?path=src", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET files?path=src: status=%d body=%s", rr.Code, rr.Body.String())
	}

	var entries []workspace.DirEntry
	if err := json.NewDecoder(rr.Body).Decode(&entries); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(entries) != 1 || entries[0].Name != "main.go" {
		t.Errorf("expected [main.go], got %v", entries)
	}
}

// TestFilesHandler_PathTraversal verifies that a ../ path escape attempt
// returns 400.
func TestFilesHandler_PathTraversal(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-traversal")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	registerProject(pm, "proj1", repoRoot)
	r := newRouter(wm, pm)

	req := httptest.NewRequest(http.MethodPost, "/api/projects/proj1/workspaces",
		strings.NewReader(`{"branch":"feature-traversal"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST workspaces: status=%d", rr.Code)
	}
	var ws workspace.Workspace
	if err := json.NewDecoder(rr.Body).Decode(&ws); err != nil {
		t.Fatalf("decode: %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces/"+ws.ID+"/files?path=../../etc", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("GET files?path=../../etc: status=%d, want 400", rr.Code)
	}
}

// TestFileHandler_ReturnsFileContents verifies that GET .../file?path= returns
// the raw file contents.
func TestFileHandler_ReturnsFileContents(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-readfile")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	registerProject(pm, "proj1", repoRoot)
	r := newRouter(wm, pm)

	req := httptest.NewRequest(http.MethodPost, "/api/projects/proj1/workspaces",
		strings.NewReader(`{"branch":"feature-readfile"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST workspaces: status=%d", rr.Code)
	}
	var ws workspace.Workspace
	if err := json.NewDecoder(rr.Body).Decode(&ws); err != nil {
		t.Fatalf("decode: %v", err)
	}
	got, _ := wm.Get("proj1", ws.ID)

	const content = "package main\n\nfunc main() {}\n"
	if err := os.WriteFile(filepath.Join(got.RootPath, "main.go"), []byte(content), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces/"+ws.ID+"/file?path=main.go", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET file?path=main.go: status=%d body=%s", rr.Code, rr.Body.String())
	}
	if body := rr.Body.String(); !strings.Contains(body, "package main") {
		t.Errorf("expected file contents, got: %s", body)
	}
}

// TestFileHandler_MissingPath verifies that omitting path= returns 400.
func TestFileHandler_MissingPath(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-nopath")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	registerProject(pm, "proj1", repoRoot)
	r := newRouter(wm, pm)

	req := httptest.NewRequest(http.MethodPost, "/api/projects/proj1/workspaces",
		strings.NewReader(`{"branch":"feature-nopath"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST workspaces: status=%d", rr.Code)
	}
	var ws workspace.Workspace
	if err := json.NewDecoder(rr.Body).Decode(&ws); err != nil {
		t.Fatalf("decode: %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces/"+ws.ID+"/file", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("GET file (no path): status=%d, want 400", rr.Code)
	}
}

// TestFileHandler_PathTraversal verifies that a ../ path escape attempt returns 400.
func TestFileHandler_PathTraversal(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-ftraversal")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	registerProject(pm, "proj1", repoRoot)
	r := newRouter(wm, pm)

	req := httptest.NewRequest(http.MethodPost, "/api/projects/proj1/workspaces",
		strings.NewReader(`{"branch":"feature-ftraversal"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST workspaces: status=%d", rr.Code)
	}
	var ws workspace.Workspace
	if err := json.NewDecoder(rr.Body).Decode(&ws); err != nil {
		t.Fatalf("decode: %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/projects/proj1/workspaces/"+ws.ID+"/file?path=../../etc/passwd", nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("GET file?path=../../etc/passwd: status=%d, want 400", rr.Code)
	}
}
