// Package spa embeds the compiled React SPA and provides an HTTP handler that
// serves it, falling back to index.html for client-side routes.
package spa

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed all:dist
var dist embed.FS

// Handler returns an http.Handler that serves the embedded SPA.
//
// Requests whose path matches a file in the embedded dist directory are served
// directly.  All other paths fall back to index.html so that the React Router
// client-side routes (e.g. /projects, /projects/:pid/workspaces) are handled
// by the SPA.
func Handler() http.Handler {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		// Unreachable: "dist" is always present (at worst just .gitkeep).
		panic("spa: sub-FS creation failed: " + err.Error())
	}
	return &spaHandler{fs: http.FS(sub)}
}

type spaHandler struct {
	fs http.FileSystem
}

func (h *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Only serve GET/HEAD; anything else is a 405.
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Clean the path and try to open it directly.
	p := r.URL.Path
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}

	f, err := h.fs.Open(p)
	if err == nil {
		stat, statErr := f.Stat()
		f.Close()
		if statErr == nil && !stat.IsDir() {
			// Exact file found — serve it.
			http.FileServer(h.fs).ServeHTTP(w, r)
			return
		}
	}

	// Fall back to index.html for SPA client-side routing.
	r2 := r.Clone(r.Context())
	r2.URL.Path = "/index.html"
	http.FileServer(h.fs).ServeHTTP(w, r2)
}
