package project_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/mux"

	"github.com/greghaynes/dev-console/internal/project"
)

// newTestRouter sets up a gorilla/mux router with the project routes registered.
func newTestRouter(m *project.Manager) *mux.Router {
	r := mux.NewRouter()
	api := r.PathPrefix("/api").Subrouter()
	project.RegisterRoutes(api, m, nil)
	return r
}

func TestListProjects_EmptyReturnsArray(t *testing.T) {
	r := newTestRouter(project.NewManager(t.TempDir()))

	req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	var got []json.RawMessage
	if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty array, got %d items", len(got))
	}
}

func TestCreateProject_MissingRepoURL_Returns400(t *testing.T) {
	r := newTestRouter(project.NewManager(t.TempDir()))

	req := httptest.NewRequest(http.MethodPost, "/api/projects",
		strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

func TestCreateProject_InvalidRepoURL_Returns400(t *testing.T) {
	r := newTestRouter(project.NewManager(t.TempDir()))

	req := httptest.NewRequest(http.MethodPost, "/api/projects",
		strings.NewReader(`{"repoURL":"not-a-valid-github-url"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

func TestGetProject_NotFound_Returns404(t *testing.T) {
	r := newTestRouter(project.NewManager(t.TempDir()))

	req := httptest.NewRequest(http.MethodGet, "/api/projects/does-not-exist", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

func TestDeleteProject_NotFound_Returns404(t *testing.T) {
	r := newTestRouter(project.NewManager(t.TempDir()))

	req := httptest.NewRequest(http.MethodDelete, "/api/projects/does-not-exist", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rr.Code)
	}
}

// --- Manager unit tests ---

func TestManager_Get_NotFound(t *testing.T) {
	m := project.NewManager(t.TempDir())
	_, err := m.Get("nonexistent")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestManager_Delete_NotFound(t *testing.T) {
	m := project.NewManager(t.TempDir())
	err := m.Delete("nonexistent")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// TestManager_Create_InvalidURL verifies that invalid URLs return an error
// without attempting a git clone.
func TestManager_Create_InvalidURL(t *testing.T) {
	m := project.NewManager(t.TempDir())
	_, err := m.Create("not-a-github-url")
	if err == nil {
		t.Fatal("expected error for invalid URL, got nil")
	}
}

func TestManager_List_Empty(t *testing.T) {
	m := project.NewManager(t.TempDir())
	projects := m.List()
	if len(projects) != 0 {
		t.Errorf("expected empty list, got %d items", len(projects))
	}
}

// TestCreateProject_InvalidBody_Returns400 verifies that malformed JSON returns 400.
func TestCreateProject_InvalidBody_Returns400(t *testing.T) {
	r := newTestRouter(project.NewManager(t.TempDir()))

	req := httptest.NewRequest(http.MethodPost, "/api/projects",
		strings.NewReader(`{invalid}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

// TestListProjects_ContentType verifies the response Content-Type is JSON.
func TestListProjects_ContentType(t *testing.T) {
	r := newTestRouter(project.NewManager(t.TempDir()))

	req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	ct := rr.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "application/json") {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}
