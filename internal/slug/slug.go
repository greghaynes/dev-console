// Package slug provides URL-safe slug generation for project and workspace IDs.
package slug

import (
	"fmt"
	"path"
	"regexp"
	"strings"
)

// nonAlnum matches any run of characters that are not lowercase letters or digits.
var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// Generate creates a URL-safe slug from input (a repository URL or branch name)
// and ensures uniqueness using the exists callback.  If the base slug is already
// taken, numeric suffixes (-2, -3, …) are tried until a free slot is found.
func Generate(input string, exists func(string) bool) string {
	base := toBase(input)

	if !exists(base) {
		return base
	}

	for n := 2; ; n++ {
		candidate := fmt.Sprintf("%s-%d", base, n)
		if !exists(candidate) {
			return candidate
		}
	}
}

// toBase converts an arbitrary string into a base slug:
//   - For strings that look like URLs, only the final path segment is used.
//   - The string is lowercased.
//   - Every run of non-alphanumeric characters is replaced with a single hyphen.
//   - Leading and trailing hyphens are trimmed.
func toBase(input string) string {
	// Use only the final path segment (handles both URLs and plain branch names).
	segment := path.Base(input)
	// If path.Base returned "." or "/" (degenerate cases), fall back to input.
	if segment == "." || segment == "/" {
		segment = input
	}

	lowered := strings.ToLower(segment)
	hyphenated := nonAlnum.ReplaceAllString(lowered, "-")
	trimmed := strings.Trim(hyphenated, "-")

	if trimmed == "" {
		trimmed = "project"
	}
	return trimmed
}
