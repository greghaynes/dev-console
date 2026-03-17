// Package terminal_test contains tests for the terminal package.
//
// # Testing approach
//
// Tests are divided into two groups:
//
//  1. Unit tests for the Manager type — these verify in-memory registry
//     operations (Create, Get, Delete) in isolation.
//
//  2. HTTP handler tests — these drive the REST endpoints (POST, DELETE)
//     through net/http/httptest against a temporary local git repository.
//
// WebSocket tests are omitted from this package because gorilla/websocket
// requires a real TCP connection, which is tested manually via the acceptance
// criteria described in the implementation plan.
package terminal_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"testing"

	"github.com/gorilla/mux"

	"github.com/greghaynes/dev-console/internal/project"
	"github.com/greghaynes/dev-console/internal/terminal"
	"github.com/greghaynes/dev-console/internal/workspace"
)

// ── helpers ───────────────────────────────────────────────────────────────────

func newRouter(tm *terminal.Manager, wm *workspace.Manager, pm *project.Manager) *mux.Router {
	r := mux.NewRouter()
	api := r.PathPrefix("/api").Subrouter()
	terminal.RegisterRoutes(api, tm, wm, pm)
	workspace.RegisterRoutes(api, wm, pm)
	return r
}

// newLocalGitRepo creates a temporary bare source repository, clones it, and
// returns the clone path.  extraBranches are created from the initial commit.
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

func gitRun(t *testing.T, name string, args ...string) {
	t.Helper()
	cmd := exec.Command(name, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("running %v: %v\noutput: %s", append([]string{name}, args...), err, out)
	}
}

func registerProject(pm *project.Manager, id, repoRoot string) {
	pm.RegisterForTest(id, id, "https://github.com/owner/"+id, repoRoot)
}

// ── Manager unit tests ────────────────────────────────────────────────────────

// TestManager_Get_NotFound verifies that Get returns ErrNotFound for an
// unknown session.
func TestManager_Get_NotFound(t *testing.T) {
	tm := terminal.NewManager()
	_, err := tm.Get("proj", "ws", "unknown")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// TestManager_Delete_NotFound verifies that Delete returns an error for an
// unknown session.
func TestManager_Delete_NotFound(t *testing.T) {
	tm := terminal.NewManager()
	err := tm.Delete("proj", "ws", "unknown")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// TestManager_Create_Get_Delete exercises the full lifecycle of a terminal
// session through the Manager API with a real PTY.
func TestManager_Create_Get_Delete(t *testing.T) {
	repoRoot := newLocalGitRepo(t)
	tm := terminal.NewManager()

	sess, err := tm.Create("proj", "ws", repoRoot)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if sess.ID == "" {
		t.Error("session ID must not be empty")
	}
	if sess.PTY() == nil {
		t.Error("session PTY must not be nil")
	}

	got, err := tm.Get("proj", "ws", sess.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != sess.ID {
		t.Errorf("Get returned ID %q, want %q", got.ID, sess.ID)
	}

	if err := tm.Delete("proj", "ws", sess.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := tm.Get("proj", "ws", sess.ID); err == nil {
		t.Fatal("Get after Delete should return error")
	}
}

// ── HTTP handler tests ────────────────────────────────────────────────────────

// TestTerminalCreate_Returns201 verifies that POST /terminals returns 201 with
// a { terminalId } JSON body when the project and workspace exist.
func TestTerminalCreate_Returns201(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-a")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	tm := terminal.NewManager()
	registerProject(pm, "proj1", repoRoot)

	// Create a workspace first.
	_, err := wm.Create("proj1", repoRoot, "feature-a", "Feature A", nil)
	if err != nil {
		t.Fatalf("creating workspace: %v", err)
	}
	wsList := wm.List("proj1")
	if len(wsList) == 0 {
		t.Fatal("expected at least one workspace")
	}
	wid := wsList[0].ID

	r := newRouter(tm, wm, pm)

	req := httptest.NewRequest(http.MethodPost,
		"/api/projects/proj1/workspaces/"+wid+"/terminals", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("POST terminals: status = %d, want 201; body: %s", rr.Code, rr.Body.String())
	}

	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp["terminalId"] == "" {
		t.Error("terminalId must not be empty in response")
	}

	// Clean up the session.
	_ = tm.Delete("proj1", wid, resp["terminalId"])
}

// TestTerminalCreate_UnknownProject_Returns404 verifies a 404 for unknown project.
func TestTerminalCreate_UnknownProject_Returns404(t *testing.T) {
	r := newRouter(terminal.NewManager(), workspace.NewManager(), project.NewManager(t.TempDir()))
	req := httptest.NewRequest(http.MethodPost,
		"/api/projects/unknown/workspaces/w1/terminals", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

// TestTerminalCreate_UnknownWorkspace_Returns404 verifies a 404 for unknown
// workspace.
func TestTerminalCreate_UnknownWorkspace_Returns404(t *testing.T) {
	pm := project.NewManager(t.TempDir())
	repoRoot := newLocalGitRepo(t)
	registerProject(pm, "proj1", repoRoot)

	r := newRouter(terminal.NewManager(), workspace.NewManager(), pm)
	req := httptest.NewRequest(http.MethodPost,
		"/api/projects/proj1/workspaces/no-such-ws/terminals", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

// TestTerminalDelete_Returns204 verifies that DELETE /terminals/:tid returns
// 204 for an existing session and 404 after deletion.
func TestTerminalDelete_Returns204(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-b")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	tm := terminal.NewManager()
	registerProject(pm, "proj1", repoRoot)

	ws, err := wm.Create("proj1", repoRoot, "feature-b", "", nil)
	if err != nil {
		t.Fatalf("creating workspace: %v", err)
	}

	sess, err := tm.Create("proj1", ws.ID, ws.RootPath)
	if err != nil {
		t.Fatalf("creating terminal: %v", err)
	}

	r := newRouter(tm, wm, pm)
	path := "/api/projects/proj1/workspaces/" + ws.ID + "/terminals/" + sess.ID

	// DELETE → 204
	req := httptest.NewRequest(http.MethodDelete, path, nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("DELETE terminal: status = %d, want 204; body: %s", rr.Code, rr.Body.String())
	}

	// DELETE again → 404
	req = httptest.NewRequest(http.MethodDelete, path, nil)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("DELETE terminal (2nd): status = %d, want 404", rr.Code)
	}
}

// TestTerminalDelete_UnknownTerminal_Returns404 verifies that deleting a
// non-existent terminal ID returns 404.
func TestTerminalDelete_UnknownTerminal_Returns404(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-c")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	tm := terminal.NewManager()
	registerProject(pm, "proj1", repoRoot)

	ws, err := wm.Create("proj1", repoRoot, "feature-c", "", nil)
	if err != nil {
		t.Fatalf("creating workspace: %v", err)
	}

	r := newRouter(tm, wm, pm)
	path := "/api/projects/proj1/workspaces/" + ws.ID + "/terminals/no-such-tid"

	req := httptest.NewRequest(http.MethodDelete, path, nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

// TestTerminalJSON_TerminalIDInResponse verifies that the POST response
// contains terminalId and not internal fields.
func TestTerminalJSON_TerminalIDInResponse(t *testing.T) {
	repoRoot := newLocalGitRepo(t, "feature-d")
	pm := project.NewManager(t.TempDir())
	wm := workspace.NewManager()
	tm := terminal.NewManager()
	registerProject(pm, "proj1", repoRoot)

	ws, err := wm.Create("proj1", repoRoot, "feature-d", "", nil)
	if err != nil {
		t.Fatalf("creating workspace: %v", err)
	}

	r := newRouter(tm, wm, pm)
	req := httptest.NewRequest(http.MethodPost,
		"/api/projects/proj1/workspaces/"+ws.ID+"/terminals", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", rr.Code)
	}
	body := rr.Body.String()
	if !strings.Contains(body, "terminalId") {
		t.Errorf("response should contain terminalId, got: %s", body)
	}

	var resp map[string]string
	if err := json.Unmarshal([]byte(body), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	tid := resp["terminalId"]
	if tid == "" {
		t.Error("terminalId must not be empty")
	}
	// Clean up.
	_ = tm.Delete("proj1", ws.ID, tid)
}
