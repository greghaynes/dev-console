package project

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gorilla/mux"
)

// RegisterRoutes wires up project-related API routes onto the provided
// subrouter.  All routes are expected to be behind RequireAuth already.
// The workspace delete callback is invoked for each workspace before a project
// is deleted, allowing the caller to cascade the removal.
func RegisterRoutes(r *mux.Router, m *Manager, deleteWorkspaces func(projectID string) error) {
	r.HandleFunc("/projects", listHandler(m)).Methods(http.MethodGet)
	r.HandleFunc("/projects", createHandler(m)).Methods(http.MethodPost)
	r.HandleFunc("/projects/{pid}", getHandler(m)).Methods(http.MethodGet)
	r.HandleFunc("/projects/{pid}", deleteHandler(m, deleteWorkspaces)).Methods(http.MethodDelete)
}

func listHandler(m *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projects := m.List()
		if projects == nil {
			projects = []*Project{}
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(projects); err != nil {
			http.Error(w, "encoding response", http.StatusInternalServerError)
		}
	}
}

func createHandler(m *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			RepoURL string `json:"repoURL"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if body.RepoURL == "" {
			http.Error(w, "repoURL is required", http.StatusBadRequest)
			return
		}

		p, err := m.Create(body.RepoURL)
		if err != nil {
			// Validation errors (invalid URL) produce 400; clone failures produce 502.
			if isValidationError(err) {
				http.Error(w, err.Error(), http.StatusBadRequest)
			} else {
				http.Error(w, "failed to create project: "+err.Error(), http.StatusBadGateway)
			}
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		if err := json.NewEncoder(w).Encode(p); err != nil {
			http.Error(w, "encoding response", http.StatusInternalServerError)
		}
	}
}

func getHandler(m *Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid := mux.Vars(r)["pid"]
		p, err := m.Get(pid)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(p); err != nil {
			http.Error(w, "encoding response", http.StatusInternalServerError)
		}
	}
}

func deleteHandler(m *Manager, deleteWorkspaces func(projectID string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid := mux.Vars(r)["pid"]

		// Verify project exists before cascading.
		if _, err := m.Get(pid); err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// Cascade: remove all workspaces first.
		if deleteWorkspaces != nil {
			if err := deleteWorkspaces(pid); err != nil {
				http.Error(w, "failed to delete workspaces: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}

		if err := m.Delete(pid); err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to delete project: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// isValidationError returns true when err is a validation (400-class) error
// from project creation (i.e. an invalid repoURL).
func isValidationError(err error) bool {
	return isURLValidationErr(err)
}

func isURLValidationErr(err error) bool {
	const msg = "repoURL must be a valid GitHub HTTPS clone URL"
	return err != nil && err.Error() == msg
}
