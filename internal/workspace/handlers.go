package workspace

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"github.com/greghaynes/dev-console/internal/project"
)

// DirEntry describes a single file-system entry returned by the files listing
// endpoint.
type DirEntry struct {
	Name    string    `json:"name"`
	Type    string    `json:"type"` // "file" or "dir"
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
}

// RegisterRoutes wires up workspace-related API routes onto the provided
// subrouter.  All routes are expected to be behind RequireAuth already.
func RegisterRoutes(r *mux.Router, wm *Manager, pm *project.Manager) {
	r.HandleFunc("/projects/{pid}/workspaces", listHandler(wm, pm)).Methods(http.MethodGet)
	r.HandleFunc("/projects/{pid}/workspaces", createHandler(wm, pm)).Methods(http.MethodPost)
	r.HandleFunc("/projects/{pid}/workspaces/{wid}", getHandler(wm, pm)).Methods(http.MethodGet)
	r.HandleFunc("/projects/{pid}/workspaces/{wid}", deleteHandler(wm, pm)).Methods(http.MethodDelete)
	r.HandleFunc("/projects/{pid}/workspaces/{wid}/files", filesHandler(wm, pm)).Methods(http.MethodGet)
	r.HandleFunc("/projects/{pid}/workspaces/{wid}/file", fileHandler(wm, pm)).Methods(http.MethodGet)
}

func listHandler(wm *Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid := mux.Vars(r)["pid"]
		if _, err := pm.Get(pid); err != nil {
			if errors.Is(err, project.ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		workspaces := wm.List(pid)
		if workspaces == nil {
			workspaces = []*Workspace{}
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(workspaces); err != nil {
			http.Error(w, "encoding response", http.StatusInternalServerError)
		}
	}
}

func createHandler(wm *Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid := mux.Vars(r)["pid"]

		p, err := pm.Get(pid)
		if err != nil {
			if errors.Is(err, project.ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		var body struct {
			Branch   string `json:"branch"`
			Name     string `json:"name"`
			PRNumber *int   `json:"prNumber"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if body.Branch == "" {
			http.Error(w, "branch is required", http.StatusBadRequest)
			return
		}

		ws, err := wm.Create(pid, p.RootPath, body.Branch, body.Name, body.PRNumber)
		if err != nil {
			http.Error(w, "failed to create workspace: "+err.Error(), http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		if err := json.NewEncoder(w).Encode(ws); err != nil {
			http.Error(w, "encoding response", http.StatusInternalServerError)
		}
	}
}

func getHandler(wm *Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid := vars["pid"], vars["wid"]

		if _, err := pm.Get(pid); err != nil {
			if errors.Is(err, project.ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		ws, err := wm.Get(pid, wid)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "workspace not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(ws); err != nil {
			http.Error(w, "encoding response", http.StatusInternalServerError)
		}
	}
}

func deleteHandler(wm *Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid := vars["pid"], vars["wid"]

		if _, err := pm.Get(pid); err != nil {
			if errors.Is(err, project.ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		if err := wm.Delete(pid, wid); err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "workspace not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to delete workspace: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// safeWorkspacePath resolves a client-supplied relative path against the
// workspace root, cleans it, and confirms the result is still inside the
// workspace root.  Returns the absolute path on success, or an empty string
// and a non-nil error if the path escapes the root.
func safeWorkspacePath(wsRoot, relPath string) (string, error) {
	// Default to the workspace root itself when no path is given.
	if relPath == "" {
		return wsRoot, nil
	}

	// Join the workspace root with the user-supplied relative path and clean.
	abs, err := filepath.Abs(filepath.Join(wsRoot, relPath))
	if err != nil {
		return "", err
	}

	// Require the resolved path to be inside the workspace root.
	// filepath.Clean already removes ".."; this final check is the safety net.
	root := filepath.Clean(wsRoot)
	if abs != root && !strings.HasPrefix(abs, root+string(filepath.Separator)) {
		return "", errors.New("path escapes workspace root")
	}
	return abs, nil
}

// filesHandler handles GET /projects/:pid/workspaces/:wid/files?path=<dir>
// and returns a JSON array of DirEntry objects for the directory at path
// (defaults to the workspace root).
func filesHandler(wm *Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid := vars["pid"], vars["wid"]

		if _, err := pm.Get(pid); err != nil {
			if errors.Is(err, project.ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		ws, err := wm.Get(pid, wid)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "workspace not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		relPath := r.URL.Query().Get("path")
		absPath, err := safeWorkspacePath(ws.RootPath, relPath)
		if err != nil {
			http.Error(w, "invalid path: "+err.Error(), http.StatusBadRequest)
			return
		}

		entries, err := os.ReadDir(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "path not found", http.StatusNotFound)
				return
			}
			http.Error(w, "reading directory: "+err.Error(), http.StatusInternalServerError)
			return
		}

		result := make([]DirEntry, 0, len(entries))
		for _, e := range entries {
			info, err := e.Info()
			if err != nil {
				continue
			}
			entryType := "file"
			if e.IsDir() {
				entryType = "dir"
			}
			result = append(result, DirEntry{
				Name:    e.Name(),
				Type:    entryType,
				Size:    info.Size(),
				ModTime: info.ModTime().UTC(),
			})
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(result); err != nil {
			http.Error(w, "encoding response", http.StatusInternalServerError)
		}
	}
}

// fileHandler handles GET /projects/:pid/workspaces/:wid/file?path=<file>
// and returns the raw contents of the file at path.
func fileHandler(wm *Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid := vars["pid"], vars["wid"]

		if _, err := pm.Get(pid); err != nil {
			if errors.Is(err, project.ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		ws, err := wm.Get(pid, wid)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "workspace not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		relPath := r.URL.Query().Get("path")
		if relPath == "" {
			http.Error(w, "path query parameter is required", http.StatusBadRequest)
			return
		}

		absPath, err := safeWorkspacePath(ws.RootPath, relPath)
		if err != nil {
			http.Error(w, "invalid path: "+err.Error(), http.StatusBadRequest)
			return
		}

		info, err := os.Stat(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "file not found", http.StatusNotFound)
				return
			}
			http.Error(w, "stat file: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if info.IsDir() {
			http.Error(w, "path is a directory", http.StatusBadRequest)
			return
		}

		http.ServeFile(w, r, absPath)
	}
}
