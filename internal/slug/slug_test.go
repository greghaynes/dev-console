package slug_test

import (
	"testing"

	"github.com/greghaynes/dev-console/internal/slug"
)

func TestGenerate_RepoURL(t *testing.T) {
	// The slug should be derived from the final URL segment.
	got := slug.Generate("https://github.com/owner/my-repo", noneExist)
	if want := "my-repo"; got != want {
		t.Errorf("slug = %q, want %q", got, want)
	}
}

func TestGenerate_Lowercase(t *testing.T) {
	got := slug.Generate("https://github.com/owner/MyRepo", noneExist)
	if want := "myrepo"; got != want {
		t.Errorf("slug = %q, want %q", got, want)
	}
}

func TestGenerate_SpecialCharsReplaced(t *testing.T) {
	got := slug.Generate("feature/my--feature_branch", noneExist)
	if want := "my-feature-branch"; got != want {
		t.Errorf("slug = %q, want %q", got, want)
	}
}

func TestGenerate_BranchName(t *testing.T) {
	got := slug.Generate("main", noneExist)
	if want := "main"; got != want {
		t.Errorf("slug = %q, want %q", got, want)
	}
}

func TestGenerate_UniquenessSuffix(t *testing.T) {
	existing := map[string]bool{"my-repo": true, "my-repo-2": true}
	exists := func(s string) bool { return existing[s] }

	got := slug.Generate("https://github.com/owner/my-repo", exists)
	if want := "my-repo-3"; got != want {
		t.Errorf("slug = %q, want %q", got, want)
	}
}

func TestGenerate_FirstSlotFree(t *testing.T) {
	existing := map[string]bool{"other": true}
	exists := func(s string) bool { return existing[s] }

	got := slug.Generate("https://github.com/owner/my-repo", exists)
	if want := "my-repo"; got != want {
		t.Errorf("slug = %q, want %q", got, want)
	}
}

func TestGenerate_EmptyInput(t *testing.T) {
	// Degenerate input should still produce a non-empty slug.
	got := slug.Generate("", noneExist)
	if got == "" {
		t.Error("expected non-empty slug for empty input")
	}
}

// noneExist is a helper that reports that no slug is taken.
func noneExist(_ string) bool { return false }
