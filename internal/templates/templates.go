// Package templates provides embedded HTML templates and rendering helpers
// for the dev-console auth validation site.
package templates

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"
	"net/http"
)

//go:embed index.html login.html
var files embed.FS

var (
	indexTmpl *template.Template
	loginTmpl *template.Template
)

func init() {
	indexTmpl = template.Must(template.ParseFS(files, "index.html"))
	loginTmpl = template.Must(template.ParseFS(files, "login.html"))
}

// IndexData holds the values rendered into the authenticated index page.
type IndexData struct {
	Login string
	ID    int64
}

// RenderIndex writes the authenticated index page to w using data.
func RenderIndex(w http.ResponseWriter, data IndexData) {
	var buf bytes.Buffer
	if err := indexTmpl.Execute(&buf, data); err != nil {
		http.Error(w, fmt.Sprintf("rendering index page: %v", err), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = buf.WriteTo(w)
}

// RenderLogin writes the login page to w.
func RenderLogin(w http.ResponseWriter) {
	var buf bytes.Buffer
	if err := loginTmpl.Execute(&buf, nil); err != nil {
		http.Error(w, fmt.Sprintf("rendering login page: %v", err), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = buf.WriteTo(w)
}
