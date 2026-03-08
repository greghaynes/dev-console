package templates_test

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/greghaynes/dev-console/internal/templates"
)

func TestRenderIndex_ContainsLogin(t *testing.T) {
	rr := httptest.NewRecorder()
	templates.RenderIndex(rr, templates.IndexData{Login: "alice", ID: 42})

	if rr.Code != 200 {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	body := rr.Body.String()
	if !strings.Contains(body, "alice") {
		t.Error("response body does not contain login name")
	}
	if !strings.Contains(body, "42") {
		t.Error("response body does not contain user ID")
	}
	if !strings.Contains(body, "/auth/logout") {
		t.Error("response body does not contain sign-out form action")
	}
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("Content-Type = %q, want text/html", ct)
	}
}

func TestRenderLogin_ContainsSignInLink(t *testing.T) {
	rr := httptest.NewRecorder()
	templates.RenderLogin(rr)

	if rr.Code != 200 {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	body := rr.Body.String()
	if !strings.Contains(body, "/auth/login") {
		t.Error("response body does not contain /auth/login link")
	}
	if !strings.Contains(body, "Sign in with GitHub") {
		t.Error("response body does not contain sign-in button text")
	}
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("Content-Type = %q, want text/html", ct)
	}
}
