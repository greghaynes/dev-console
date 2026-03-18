package agent

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"

	"github.com/greghaynes/dev-console/internal/project"
	"github.com/greghaynes/dev-console/internal/workspace"
)

// upgrader accepts all origins; authentication is enforced by RequireAuth middleware.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

// RegisterRoutes wires up agent-related API routes onto the provided subrouter.
// All routes are expected to already be behind RequireAuth.
func RegisterRoutes(r *mux.Router, am *Manager, wm *workspace.Manager, pm *project.Manager) {
	base := "/projects/{pid}/workspaces/{wid}/sessions"
	r.HandleFunc(base, listHandler(am, wm, pm)).Methods(http.MethodGet)
	r.HandleFunc(base, createHandler(am, wm, pm)).Methods(http.MethodPost)
	r.HandleFunc(base+"/{sid}", deleteHandler(am, wm, pm)).Methods(http.MethodDelete)
	r.HandleFunc(base+"/{sid}/messages", messagesHandler(am, wm, pm)).Methods(http.MethodGet)
	r.HandleFunc(base+"/{sid}/chat", chatHandler(am, wm, pm)).Methods(http.MethodGet)
}

// listHandler handles GET /api/projects/:pid/workspaces/:wid/sessions.
func listHandler(am *Manager, wm *workspace.Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid := vars["pid"], vars["wid"]

		if err := requireProjectAndWorkspace(pm, wm, pid, wid, w); err != nil {
			return
		}

		sessions := am.List(pid, wid)
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(sessions); err != nil {
			log.Printf("agent: encoding list response: %v", err)
		}
	}
}

// createHandler handles POST /api/projects/:pid/workspaces/:wid/sessions.
func createHandler(am *Manager, wm *workspace.Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid := vars["pid"], vars["wid"]

		if err := requireProjectAndWorkspace(pm, wm, pid, wid, w); err != nil {
			return
		}

		sess, err := am.Create(pid, wid)
		if err != nil {
			http.Error(w, "failed to create session: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		if err := json.NewEncoder(w).Encode(sess); err != nil {
			log.Printf("agent: encoding create response: %v", err)
		}
	}
}

// deleteHandler handles DELETE /api/projects/:pid/workspaces/:wid/sessions/:sid.
func deleteHandler(am *Manager, wm *workspace.Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid, sid := vars["pid"], vars["wid"], vars["sid"]

		if err := requireProjectAndWorkspace(pm, wm, pid, wid, w); err != nil {
			return
		}

		if err := am.Delete(pid, wid, sid); err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to delete session: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// messagesHandler handles GET /api/projects/:pid/workspaces/:wid/sessions/:sid/messages.
func messagesHandler(am *Manager, wm *workspace.Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid, sid := vars["pid"], vars["wid"], vars["sid"]

		if err := requireProjectAndWorkspace(pm, wm, pid, wid, w); err != nil {
			return
		}

		sess, err := am.Get(pid, wid, sid)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		sess.mu.Lock()
		history := make([]interface{}, len(sess.History))
		for i, m := range sess.History {
			history[i] = m
		}
		sess.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(history); err != nil {
			log.Printf("agent: encoding messages response: %v", err)
		}
	}
}

// chatHandler handles WS /api/projects/:pid/workspaces/:wid/sessions/:sid/chat.
//
// Protocol (JSON text frames):
//
//	Client → Server: { "type": "user_message", "content": "..." }
//	                 { "type": "cancel" }
//	Server → Client: { "type": "assistant_chunk", "content": "..." }
//	                 { "type": "tool_call", "id": "...", "name": "...", "arguments": "..." }
//	                 { "type": "tool_result", "id": "...", "content": "..." }
//	                 { "type": "assistant_done" }
//	                 { "type": "error", "message": "..." }
func chatHandler(am *Manager, wm *workspace.Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid, sid := vars["pid"], vars["wid"], vars["sid"]

		if err := requireProjectAndWorkspace(pm, wm, pid, wid, w); err != nil {
			return
		}

		sess, err := am.Get(pid, wid, sid)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "session not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("agent: WebSocket upgrade failed: %v", err)
			return
		}
		defer conn.Close()

		// sendEvent serialises a TurnEvent as a JSON text frame.
		sendEvent := func(evt TurnEvent) error {
			data, merr := json.Marshal(evt)
			if merr != nil {
				return merr
			}
			return conn.WriteMessage(websocket.TextMessage, data)
		}

		for {
			_, data, rerr := conn.ReadMessage()
			if rerr != nil {
				return
			}

			var msg struct {
				Type    string `json:"type"`
				Content string `json:"content"`
			}
			if jerr := json.Unmarshal(data, &msg); jerr != nil {
				_ = sendEvent(TurnEvent{Type: "error", Message: "invalid message"})
				continue
			}

			switch msg.Type {
			case "user_message":
				if msg.Content == "" {
					_ = sendEvent(TurnEvent{Type: "error", Message: "content must not be empty"})
					continue
				}
				// Run the agent turn; errors are surfaced as error frames.
				if terr := am.RunTurn(r.Context(), sess, msg.Content, sendEvent); terr != nil {
					log.Printf("agent: turn error for session %s: %v", sid, terr)
					_ = sendEvent(TurnEvent{Type: "error", Message: terr.Error()})
				}
			case "cancel":
				sess.Cancel()
			default:
				_ = sendEvent(TurnEvent{Type: "error", Message: "unknown message type"})
			}
		}
	}
}

// requireProjectAndWorkspace is a helper that verifies both the project and
// workspace exist and writes an appropriate error response if either is absent.
// It returns a non-nil error (which the caller must check) if a response has
// already been written.
func requireProjectAndWorkspace(pm *project.Manager, wm *workspace.Manager, pid, wid string, w http.ResponseWriter) error {
	if _, err := pm.Get(pid); err != nil {
		if errors.Is(err, project.ErrNotFound) {
			http.Error(w, "project not found", http.StatusNotFound)
			return err
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return err
	}
	if _, err := wm.Get(pid, wid); err != nil {
		if errors.Is(err, workspace.ErrNotFound) {
			http.Error(w, "workspace not found", http.StatusNotFound)
			return err
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return err
	}
	return nil
}
