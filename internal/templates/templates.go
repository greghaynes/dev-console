// Package templates provides embedded HTML templates and rendering helpers
// for the dev-console auth validation site.
package templates

import (
	"bytes"
	"embed"
	"html/template"
	"log"
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
		log.Printf("templates: rendering index page: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// Headers are already sent; log any write error (e.g. broken pipe) for
	// observability but do not attempt to send another response.
	if _, err := buf.WriteTo(w); err != nil {
		log.Printf("templates: writing index page response: %v", err)
	}
}

// RenderLogin writes the login page to w.
func RenderLogin(w http.ResponseWriter) {
	var buf bytes.Buffer
	if err := loginTmpl.Execute(&buf, nil); err != nil {
		log.Printf("templates: rendering login page: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	// Headers are already sent; log any write error (e.g. broken pipe) for
	// observability but do not attempt to send another response.
	if _, err := buf.WriteTo(w); err != nil {
		log.Printf("templates: writing login page response: %v", err)
	}
}
