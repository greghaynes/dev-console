// Package workspace manages git worktree-backed workspace sessions for each
// development project.
package workspace

import (
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/greghaynes/dev-console/internal/slug"
)

// ErrNotFound is returned when a workspace with the given project/workspace ID
// pair does not exist.
var ErrNotFound = errors.New("workspace not found")

// Workspace represents a single checkout of a project branch, backed by a git
// worktree on disk.
type Workspace struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"`
	Branch    string    `json:"branch"`
	PRNumber  *int      `json:"prNumber"`
	CreatedAt time.Time `json:"createdAt"`

	// RootPath is the absolute path to the git worktree on disk.
	// It is intentionally excluded from JSON API responses.
	RootPath string `json:"-"`
}

// Manager is a thread-safe in-memory registry of workspaces, scoped per
// project.  The on-disk artifact for each workspace is a git worktree created
// at <project.RootPath>/worktrees/<wid>/.
type Manager struct {
	mu         sync.RWMutex
	workspaces map[string]map[string]*Workspace // projectID → id → workspace
}

// NewManager returns a new Manager.
func NewManager() *Manager {
	return &Manager{
		workspaces: make(map[string]map[string]*Workspace),
	}
}

// Create generates a unique workspace ID, creates a git worktree for branch
// inside projectRootPath, and registers the workspace in memory.
// name defaults to branch when empty.  prNumber may be nil.
func (m *Manager) Create(projectID, projectRootPath, branch, name string, prNumber *int) (*Workspace, error) {
	if branch == "" {
		return nil, fmt.Errorf("branch is required")
	}
	if name == "" {
		name = branch
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Ensure the per-project map exists.
	if m.workspaces[projectID] == nil {
		m.workspaces[projectID] = make(map[string]*Workspace)
	}

	id := slug.Generate(branch, func(s string) bool {
		_, ok := m.workspaces[projectID][s]
		return ok
	})

	worktreePath := filepath.Join(projectRootPath, "worktrees", id)

	// Create the git worktree.
	cmd := exec.Command("git", "-C", projectRootPath, "worktree", "add", worktreePath, branch) // #nosec G204
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("creating git worktree: %w (git output: %s)", err, out)
	}

	ws := &Workspace{
		ID:        id,
		ProjectID: projectID,
		Name:      name,
		Branch:    branch,
		PRNumber:  prNumber,
		RootPath:  worktreePath,
		CreatedAt: time.Now().UTC(),
	}
	m.workspaces[projectID][id] = ws
	return ws, nil
}

// List returns all workspaces for projectID.  Returns an empty slice when the
// project has no workspaces.
func (m *Manager) List(projectID string) []*Workspace {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pm := m.workspaces[projectID]
	out := make([]*Workspace, 0, len(pm))
	for _, ws := range pm {
		out = append(out, ws)
	}
	return out
}

// Get returns the workspace identified by (projectID, id), or ErrNotFound.
func (m *Manager) Get(projectID, id string) (*Workspace, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pm := m.workspaces[projectID]
	if pm == nil {
		return nil, ErrNotFound
	}
	ws, ok := pm[id]
	if !ok {
		return nil, ErrNotFound
	}
	return ws, nil
}

// Delete removes the git worktree from disk and unregisters the workspace.
func (m *Manager) Delete(projectID, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	pm := m.workspaces[projectID]
	if pm == nil {
		return ErrNotFound
	}
	ws, ok := pm[id]
	if !ok {
		return ErrNotFound
	}

	// Run `git worktree remove` from the parent directory of the worktree
	// (i.e. the project root).  Running it from inside the worktree being
	// removed would cause git to error.
	projectRoot := filepath.Dir(filepath.Dir(ws.RootPath))                                      // RootPath = <projectRoot>/worktrees/<id>
	cmd := exec.Command("git", "-C", projectRoot, "worktree", "remove", "--force", ws.RootPath) // #nosec G204
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("removing git worktree: %w (git output: %s)", err, out)
	}

	delete(pm, id)
	return nil
}

// DeleteAll removes all workspaces for projectID.  It is used during project
// deletion to cascade workspace removal.  Errors from individual workspace
// deletions are collected and returned together.
func (m *Manager) DeleteAll(projectID string) error {
	m.mu.Lock()
	pm := m.workspaces[projectID]
	ids := make([]string, 0, len(pm))
	for id := range pm {
		ids = append(ids, id)
	}
	m.mu.Unlock()

	var errs []error
	for _, id := range ids {
		if err := m.Delete(projectID, id); err != nil && !errors.Is(err, ErrNotFound) {
			errs = append(errs, err)
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("deleting workspaces: %v", errs)
	}
	return nil
}
