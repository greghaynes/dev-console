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

// newTestRouter sets up a gorilla/mux router with workspace routes.
func newTestRouter(wm *workspace.Manager, pm *project.Manager) *mux.Router {
	r := mux.NewRouter()
	api := r.PathPrefix("/api").Subrouter()
	workspace.RegisterRoutes(api, wm, pm)
	return r
}

func TestListWorkspaces_UnknownProject_Returns404(t *testing.T) {
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	r := newTestRouter(wm, pm)

	req := httptest.NewRequest(http.MethodGet, "/api/projects/unknown/workspaces", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

func TestCreateWorkspace_UnknownProject_Returns404(t *testing.T) {
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	r := newTestRouter(wm, pm)

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
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	r := newTestRouter(wm, pm)

	req := httptest.NewRequest(http.MethodGet, "/api/projects/unknown/workspaces/w1", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

func TestDeleteWorkspace_UnknownProject_Returns404(t *testing.T) {
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	r := newTestRouter(wm, pm)

	req := httptest.NewRequest(http.MethodDelete, "/api/projects/unknown/workspaces/w1", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

// --- Workspace Manager unit tests ---

func TestManager_List_Empty(t *testing.T) {
	wm := workspace.NewManager()
	ws := wm.List("some-project")
	if len(ws) != 0 {
		t.Errorf("expected empty list, got %d items", len(ws))
	}
}

func TestManager_Get_NotFound(t *testing.T) {
	wm := workspace.NewManager()
	_, err := wm.Get("project", "workspace")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestManager_Delete_NotFound(t *testing.T) {
	wm := workspace.NewManager()
	err := wm.Delete("project", "workspace")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestManager_DeleteAll_NoneExisting(t *testing.T) {
	wm := workspace.NewManager()
	if err := wm.DeleteAll("no-such-project"); err != nil {
		t.Errorf("DeleteAll on empty project should not error: %v", err)
	}
}

// TestWorkspaceIntegration creates a real git repo and verifies the full
// workspace lifecycle (create, list, get, delete).
func TestWorkspaceIntegration(t *testing.T) {
	tmp := t.TempDir()

	sourceDir := tmp + "/source.git"
	projectRoot := tmp + "/project"
	gitRun(t, "git", "init", "--bare", sourceDir)
	gitRun(t, "git", "clone", sourceDir, projectRoot)
	gitRun(t, "git", "-C", projectRoot, "config", "user.email", "test@test.com")
	gitRun(t, "git", "-C", projectRoot, "config", "user.name", "Test")
	gitRun(t, "git", "-C", projectRoot, "commit", "--allow-empty", "-m", "init")
	gitRun(t, "git", "-C", projectRoot, "push", "origin", "master")
	// Create a feature branch so we can check it out in a worktree without
	// conflicting with the main clone's checkout of "master".
	gitRun(t, "git", "-C", projectRoot, "branch", "feature-a")

	wm := workspace.NewManager()

	// Create a workspace on "feature-a".
	ws, err := wm.Create("proj1", projectRoot, "feature-a", "My Workspace", nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if ws.ID == "" {
		t.Error("expected non-empty workspace ID")
	}
	if ws.Branch != "feature-a" {
		t.Errorf("Branch = %q, want feature-a", ws.Branch)
	}
	if ws.Name != "My Workspace" {
		t.Errorf("Name = %q, want My Workspace", ws.Name)
	}
	if ws.ProjectID != "proj1" {
		t.Errorf("ProjectID = %q, want proj1", ws.ProjectID)
	}

	// List should contain the workspace.
	list := wm.List("proj1")
	if len(list) != 1 {
		t.Fatalf("expected 1 workspace, got %d", len(list))
	}

	// Get should return the same workspace.
	got, err := wm.Get("proj1", ws.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != ws.ID {
		t.Errorf("got.ID = %q, want %q", got.ID, ws.ID)
	}

	// Delete should remove it.
	if err := wm.Delete("proj1", ws.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	// Get should now return not found.
	_, err = wm.Get("proj1", ws.ID)
	if err == nil {
		t.Fatal("expected error after delete, got nil")
	}
}

// TestWorkspaceJSON verifies that JSON serialisation excludes RootPath and
// includes projectId.
func TestWorkspaceJSON(t *testing.T) {
	tmp := t.TempDir()
	sourceDir := tmp + "/source.git"
	projectRoot := tmp + "/project"
	gitRun(t, "git", "init", "--bare", sourceDir)
	gitRun(t, "git", "clone", sourceDir, projectRoot)
	gitRun(t, "git", "-C", projectRoot, "config", "user.email", "test@test.com")
	gitRun(t, "git", "-C", projectRoot, "config", "user.name", "Test")
	gitRun(t, "git", "-C", projectRoot, "commit", "--allow-empty", "-m", "init")
	gitRun(t, "git", "-C", projectRoot, "push", "origin", "master")
	gitRun(t, "git", "-C", projectRoot, "branch", "feature-b")

	wm := workspace.NewManager()
	ws, err := wm.Create("proj1", projectRoot, "feature-b", "", nil)
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

// gitRun runs a git command and fails the test on error.
func gitRun(t *testing.T, name string, args ...string) {
	t.Helper()
	cmd := exec.Command(name, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("running %v: %v\noutput: %s", append([]string{name}, args...), err, out)
	}
}
