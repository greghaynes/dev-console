// Package terminal manages PTY-backed shell sessions for workspace terminals.
package terminal

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/greghaynes/dev-console/internal/slug"
)

// ErrNotFound is returned when a terminal session with the given ID does not
// exist.
var ErrNotFound = errors.New("terminal not found")

// Session wraps a PTY-backed shell process for a single terminal connection.
// Multiple WebSocket clients may not share a session; once the WebSocket
// disconnects the session is cleaned up.
type Session struct {
	ID          string
	WorkspaceID string
	ProjectID   string
	CreatedAt   time.Time

	mu  sync.Mutex
	cmd *exec.Cmd
	ptm *os.File // PTY master side
}

// PTY returns the PTY master file used for I/O with the shell process.
// The caller must not close it directly; use Close instead.
func (s *Session) PTY() *os.File {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.ptm
}

// Resize sends a TIOCSWINSZ ioctl to update the PTY window size.
func (s *Session) Resize(cols, rows uint16) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ptm == nil {
		return fmt.Errorf("session already closed")
	}
	return pty.Setsize(s.ptm, &pty.Winsize{Cols: cols, Rows: rows})
}

// Close terminates the shell process and releases the PTY.
func (s *Session) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var errs []error

	if s.cmd != nil && s.cmd.Process != nil {
		if err := s.cmd.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
			errs = append(errs, fmt.Errorf("killing process: %w", err))
		}
		// Reap the child to avoid zombies; ignore the exit error.
		_ = s.cmd.Wait()
		s.cmd = nil
	}

	if s.ptm != nil {
		if err := s.ptm.Close(); err != nil {
			errs = append(errs, fmt.Errorf("closing pty: %w", err))
		}
		s.ptm = nil
	}

	if len(errs) > 0 {
		return fmt.Errorf("closing terminal session: %v", errs)
	}
	return nil
}

// Manager is a thread-safe registry of terminal sessions, scoped per workspace.
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]map[string]*Session // "pid/wid" → id → session
}

// NewManager returns a new Manager.
func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]map[string]*Session),
	}
}

func sessionKey(projectID, workspaceID string) string {
	return projectID + "/" + workspaceID
}

// Create starts a new PTY-backed shell session with its working directory set
// to workspaceRoot and registers it in memory.
func (m *Manager) Create(projectID, workspaceID, workspaceRoot string) (*Session, error) {
	shell := shellBinary()

	cmd := exec.Command(shell) // #nosec G204 -- shell binary is resolved from $SHELL or a fixed allowlist (/bin/bash, /bin/sh)
	cmd.Dir = workspaceRoot
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptm, err := pty.Start(cmd)
	if err != nil {
		return nil, fmt.Errorf("starting pty: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	key := sessionKey(projectID, workspaceID)
	if m.sessions[key] == nil {
		m.sessions[key] = make(map[string]*Session)
	}

	id := slug.Generate("t", func(s string) bool {
		_, ok := m.sessions[key][s]
		return ok
	})

	sess := &Session{
		ID:          id,
		WorkspaceID: workspaceID,
		ProjectID:   projectID,
		CreatedAt:   time.Now().UTC(),
		cmd:         cmd,
		ptm:         ptm,
	}
	m.sessions[key][id] = sess
	return sess, nil
}

// Get returns the session identified by (projectID, workspaceID, id).
func (m *Manager) Get(projectID, workspaceID, id string) (*Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	key := sessionKey(projectID, workspaceID)
	ws := m.sessions[key]
	if ws == nil {
		return nil, ErrNotFound
	}
	sess, ok := ws[id]
	if !ok {
		return nil, ErrNotFound
	}
	return sess, nil
}

// Delete closes and removes the terminal session.
func (m *Manager) Delete(projectID, workspaceID, id string) error {
	m.mu.Lock()
	key := sessionKey(projectID, workspaceID)
	ws := m.sessions[key]
	if ws == nil {
		m.mu.Unlock()
		return ErrNotFound
	}
	sess, ok := ws[id]
	if !ok {
		m.mu.Unlock()
		return ErrNotFound
	}
	delete(ws, id)
	m.mu.Unlock()

	return sess.Close()
}

// shellBinary returns the path to the system shell to use for new sessions.
func shellBinary() string {
	if sh := os.Getenv("SHELL"); sh != "" {
		return sh
	}
	for _, candidate := range []string{"/bin/bash", "/bin/sh"} {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return "/bin/sh"
}
