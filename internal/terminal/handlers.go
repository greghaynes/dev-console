package terminal

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"

	"github.com/greghaynes/dev-console/internal/project"
	"github.com/greghaynes/dev-console/internal/workspace"
)

// upgrader is the gorilla/websocket upgrader used for terminal WebSocket
// connections.  CheckOrigin is permissive here because RequireAuth (JWT
// session cookie) already validates the caller.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

// RegisterRoutes wires up terminal-related API routes onto the provided
// subrouter.  All routes are expected to be behind RequireAuth already.
func RegisterRoutes(r *mux.Router, tm *Manager, wm *workspace.Manager, pm *project.Manager) {
	base := "/projects/{pid}/workspaces/{wid}/terminals"
	r.HandleFunc(base, createHandler(tm, wm, pm)).Methods(http.MethodPost)
	r.HandleFunc(base+"/{tid}", deleteHandler(tm, wm, pm)).Methods(http.MethodDelete)
	r.HandleFunc(base+"/{tid}", wsHandler(tm, wm, pm)).Methods(http.MethodGet)
}

// createHandler handles POST /api/projects/:pid/workspaces/:wid/terminals.
func createHandler(tm *Manager, wm *workspace.Manager, pm *project.Manager) http.HandlerFunc {
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
			if errors.Is(err, workspace.ErrNotFound) {
				http.Error(w, "workspace not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		sess, err := tm.Create(pid, wid, ws.RootPath)
		if err != nil {
			http.Error(w, "failed to create terminal: "+err.Error(), http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		if err := json.NewEncoder(w).Encode(map[string]string{"terminalId": sess.ID}); err != nil {
			log.Printf("terminal: encoding create response: %v", err)
		}
	}
}

// deleteHandler handles DELETE /api/projects/:pid/workspaces/:wid/terminals/:tid.
func deleteHandler(tm *Manager, wm *workspace.Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid, tid := vars["pid"], vars["wid"], vars["tid"]

		if _, err := pm.Get(pid); err != nil {
			if errors.Is(err, project.ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		if _, err := wm.Get(pid, wid); err != nil {
			if errors.Is(err, workspace.ErrNotFound) {
				http.Error(w, "workspace not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		if err := tm.Delete(pid, wid, tid); err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "terminal not found", http.StatusNotFound)
				return
			}
			http.Error(w, "failed to delete terminal: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// wsHandler handles WS /api/projects/:pid/workspaces/:wid/terminals/:tid.
//
// Protocol:
//   - First text frame must be a JSON resize message:
//     { "type": "resize", "cols": N, "rows": N }
//   - Subsequent binary or text frames are forwarded as raw PTY stdin.
//   - PTY stdout is pumped to the client as binary frames.
//   - The session is removed from the manager when the WebSocket closes.
func wsHandler(tm *Manager, wm *workspace.Manager, pm *project.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		pid, wid, tid := vars["pid"], vars["wid"], vars["tid"]

		if _, err := pm.Get(pid); err != nil {
			if errors.Is(err, project.ErrNotFound) {
				http.Error(w, "project not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		if _, err := wm.Get(pid, wid); err != nil {
			if errors.Is(err, workspace.ErrNotFound) {
				http.Error(w, "workspace not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		sess, err := tm.Get(pid, wid, tid)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				http.Error(w, "terminal not found", http.StatusNotFound)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("terminal: WebSocket upgrade failed: %v", err)
			return
		}

		pumpTerminal(conn, sess, tm, pid, wid, tid)
	}
}

// controlMsg is the JSON shape of WebSocket control frames.
type controlMsg struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// pumpTerminal wires the WebSocket conn to the PTY session:
//   - stdin: WebSocket frames → PTY master write
//   - stdout: PTY master read → WebSocket binary frames
//
// When either side closes, the function cleans up and returns.
func pumpTerminal(conn *websocket.Conn, sess *Session, tm *Manager, pid, wid, tid string) {
	defer func() {
		conn.Close()
		// Best-effort cleanup: remove the session if it hasn't been deleted already.
		if err := tm.Delete(pid, wid, tid); err != nil && !errors.Is(err, ErrNotFound) {
			log.Printf("terminal: cleanup session %s: %v", tid, err)
		}
	}()

	ptm := sess.PTY()
	if ptm == nil {
		return
	}

	// Pump PTY stdout → WebSocket in a separate goroutine.
	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 4096)
		for {
			n, err := ptm.Read(buf)
			if n > 0 {
				if werr := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); werr != nil {
					return
				}
			}
			if err != nil {
				if !errors.Is(err, io.EOF) {
					log.Printf("terminal: pty read error: %v", err)
				}
				return
			}
		}
	}()

	// Pump WebSocket → PTY stdin.
	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			return
		}

		if msgType == websocket.TextMessage {
			// Try to decode as a control message first.
			var ctrl controlMsg
			if jerr := json.Unmarshal(data, &ctrl); jerr == nil && ctrl.Type == "resize" {
				if rerr := sess.Resize(ctrl.Cols, ctrl.Rows); rerr != nil {
					log.Printf("terminal: resize error: %v", rerr)
				}
				continue
			}
		}

		// Forward raw bytes (text or binary) to PTY stdin.
		if _, werr := ptm.Write(data); werr != nil {
			return
		}

		// If the stdout pump already finished, we're done.
		select {
		case <-done:
			return
		default:
		}
	}
}
