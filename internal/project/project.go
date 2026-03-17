// Package project manages the registry of development projects and their
// on-disk git repositories.
package project

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sync"
	"time"

	"github.com/greghaynes/dev-console/internal/slug"
)

// githubHTTPSPattern matches valid GitHub HTTPS clone URLs.
var githubHTTPSPattern = regexp.MustCompile(`^https://github\.com/[^/]+/[^/]+$`)

// ErrNotFound is returned when a project with the given ID does not exist.
var ErrNotFound = errors.New("project not found")

// Project represents a registered development project backed by a cloned git
// repository on disk.
type Project struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	RepoURL   string    `json:"repoURL"`
	RootPath  string    `json:"-"`
	CreatedAt time.Time `json:"createdAt"`
}

// Manager is a thread-safe in-memory registry of projects.  The on-disk
// artifact for each project is the cloned git repository stored under
// projectsDir/<id>.
type Manager struct {
	mu          sync.RWMutex
	projects    map[string]*Project
	projectsDir string
}

// NewManager returns a new Manager that stores git repositories under
// projectsDir.
func NewManager(projectsDir string) *Manager {
	return &Manager{
		projects:    make(map[string]*Project),
		projectsDir: projectsDir,
	}
}

// Create validates repoURL, generates a unique slug ID, clones the repository
// into projectsDir/<id>, and registers the project in memory.
func (m *Manager) Create(repoURL string) (*Project, error) {
	if !githubHTTPSPattern.MatchString(repoURL) {
		return nil, fmt.Errorf("repoURL must be a valid GitHub HTTPS clone URL")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	id := slug.Generate(repoURL, func(s string) bool {
		_, ok := m.projects[s]
		return ok
	})

	rootPath := filepath.Join(m.projectsDir, id)

	// Derive a display name from the URL (final path segment).
	name := nameFromURL(repoURL)

	// Clone the repository.
	cmd := exec.Command("git", "clone", "--", repoURL, rootPath) // #nosec G204
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("cloning repository: %w (git output: %s)", err, out)
	}

	p := &Project{
		ID:        id,
		Name:      name,
		RepoURL:   repoURL,
		RootPath:  rootPath,
		CreatedAt: time.Now().UTC(),
	}
	m.projects[id] = p
	return p, nil
}

// List returns all registered projects in an unspecified order.
func (m *Manager) List() []*Project {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]*Project, 0, len(m.projects))
	for _, p := range m.projects {
		out = append(out, p)
	}
	return out
}

// Get returns the project with the given ID, or ErrNotFound.
func (m *Manager) Get(id string) (*Project, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	p, ok := m.projects[id]
	if !ok {
		return nil, ErrNotFound
	}
	return p, nil
}

// Delete removes the project from memory and deletes its on-disk root
// directory.  Any workspace worktrees must already have been removed before
// calling Delete.
func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.projects[id]
	if !ok {
		return ErrNotFound
	}

	// Remove the cloned repository from disk.
	if err := os.RemoveAll(p.RootPath); err != nil {
		return fmt.Errorf("removing project directory: %w", err)
	}

	delete(m.projects, id)
	return nil
}

// nameFromURL extracts a display name from a GitHub HTTPS URL by returning the
// final path segment (the repository name portion).
func nameFromURL(repoURL string) string {
	// filepath.Base works on URL paths too since URLs use '/'.
	return filepath.Base(repoURL)
}

// RegisterForTest inserts an already-existing local git checkout as a project
// record without performing URL-format validation or a git clone.  This is
// intended for use in package tests to pre-populate the manager with a project
// that points at a temporary local repository, bypassing the GitHub URL
// requirement and any network calls.
//
// The calling test is responsible for creating the directory at rootPath before
// calling this function.
func (m *Manager) RegisterForTest(id, name, repoURL, rootPath string) *Project {
	p := &Project{
		ID:        id,
		Name:      name,
		RepoURL:   repoURL,
		RootPath:  rootPath,
		CreatedAt: time.Now().UTC(),
	}
	m.mu.Lock()
	m.projects[id] = p
	m.mu.Unlock()
	return p
}
