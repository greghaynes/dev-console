package workspace

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/greghaynes/dev-console/internal/project"
)

// RegisterRoutes wires up workspace-related API routes onto the provided
// subrouter.  All routes are expected to be behind RequireAuth already.
func RegisterRoutes(r *mux.Router, wm *Manager, pm *project.Manager) {
	r.HandleFunc("/projects/{pid}/workspaces", listHandler(wm, pm)).Methods(http.MethodGet)
	r.HandleFunc("/projects/{pid}/workspaces", createHandler(wm, pm)).Methods(http.MethodPost)
	r.HandleFunc("/projects/{pid}/workspaces/{wid}", getHandler(wm, pm)).Methods(http.MethodGet)
	r.HandleFunc("/projects/{pid}/workspaces/{wid}", deleteHandler(wm, pm)).Methods(http.MethodDelete)
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
