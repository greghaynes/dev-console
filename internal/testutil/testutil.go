// Package testutil provides shared test helpers for Go handler and manager
// tests across internal packages.
//
// Helpers in this package eliminate the duplication of common test fixtures
// (local git repos, project registration) that previously appeared verbatim in
// the project, workspace, and terminal test files.
//
// All exported helpers call t.Helper() so failure lines point at the test
// that called the helper, not at the line inside the helper itself.
package testutil

import (
	"os/exec"
	"testing"

	"github.com/greghaynes/dev-console/internal/project"
)

// NewLocalGitRepo creates a temporary bare source repository, clones it into
// a subdirectory of a T.TempDir(), pushes an initial empty commit, and
// optionally creates the named branches.  It returns the path to the clone
// (the "project root").
//
// The resulting checkout is suitable for use as a project root without any
// network calls.  Extra branches are created from the initial commit, so they
// can be checked out as git worktrees (git does not allow a branch already
// checked out in one worktree to be opened in another).
func NewLocalGitRepo(t *testing.T, extraBranches ...string) string {
	t.Helper()
	tmp := t.TempDir()
	bare := tmp + "/source.git"
	clone := tmp + "/project"

	GitRun(t, "git", "init", "--bare", bare)
	GitRun(t, "git", "clone", bare, clone)
	GitRun(t, "git", "-C", clone, "config", "user.email", "test@test.com")
	GitRun(t, "git", "-C", clone, "config", "user.name", "Test")
	GitRun(t, "git", "-C", clone, "commit", "--allow-empty", "-m", "init")
	GitRun(t, "git", "-C", clone, "push", "origin", "master")

	for _, b := range extraBranches {
		GitRun(t, "git", "-C", clone, "branch", b)
	}
	return clone
}

// GitRun executes a git command and fails the test immediately if it exits
// with an error, printing the combined stdout/stderr for diagnostics.
func GitRun(t *testing.T, name string, args ...string) {
	t.Helper()
	cmd := exec.Command(name, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("running %v: %v\noutput: %s", append([]string{name}, args...), err, out)
	}
}

// RegisterProject adds a local git clone to the project Manager under id,
// simulating a previously-cloned project without making any network calls.
// The repoRoot path is used as the on-disk checkout location.
func RegisterProject(pm *project.Manager, id, repoRoot string) {
	pm.RegisterForTest(id, id, "https://github.com/owner/"+id, repoRoot)
}
