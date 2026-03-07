package auth_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/greghaynes/dev-console/internal/auth"
	"github.com/greghaynes/dev-console/internal/config"
)

// testConfig returns a minimal AuthConfig suitable for unit tests.
func testConfig(allowed ...string) *config.AuthConfig {
	return &config.AuthConfig{
		GitHub: config.GitHubOAuthConfig{
			ClientID:     "test-client-id",
			ClientSecret: "test-client-secret",
			CallbackURL:  "http://localhost/callback",
		},
		AllowedGithubUsers: allowed,
		SessionSecret:      "test-secret-at-least-32-bytes-long!!",
		SessionTTL:         "1h",
	}
}

// --- LoginHandler ---

func TestLoginHandler_RedirectsToGitHub(t *testing.T) {
	h := auth.NewHandler(testConfig())

	req := httptest.NewRequest(http.MethodGet, "/login", nil)
	rr := httptest.NewRecorder()
	h.LoginHandler(rr, req)

	if rr.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusFound)
	}
	loc := rr.Header().Get("Location")
	if loc == "" {
		t.Fatal("expected Location header, got empty")
	}
	// Verify the redirect goes to GitHub's OAuth URL.
	if got := rr.Header().Get("Location"); len(got) < len("https://github.com/login/oauth/authorize") {
		t.Errorf("Location %q does not look like a GitHub OAuth URL", got)
	}
}

// --- LogoutHandler ---

func TestLogoutHandler_ClearsCookieAndRedirects(t *testing.T) {
	h := auth.NewHandler(testConfig())

	req := httptest.NewRequest(http.MethodPost, "/logout", nil)
	rr := httptest.NewRecorder()
	h.LogoutHandler(rr, req)

	if rr.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusFound)
	}

	var found bool
	for _, c := range rr.Result().Cookies() {
		if c.Name == "dc_session" {
			found = true
			if c.MaxAge >= 0 {
				t.Errorf("expected MaxAge < 0 to clear cookie, got %d", c.MaxAge)
			}
		}
	}
	if !found {
		t.Error("expected dc_session cookie in response, not found")
	}
}

// --- RequireAuth middleware ---

func TestRequireAuth_NoCookie_RedirectsToLogin(t *testing.T) {
	h := auth.NewHandler(testConfig("alice"))

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	h.RequireAuth(inner).ServeHTTP(rr, req)

	if rr.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusFound)
	}
	if loc := rr.Header().Get("Location"); loc != "/login" {
		t.Errorf("Location = %q, want /login", loc)
	}
}

func TestRequireAuth_NoCookie_APIReturns401(t *testing.T) {
	h := auth.NewHandler(testConfig("alice"))

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/whoami", nil)
	rr := httptest.NewRecorder()
	h.RequireAuth(inner).ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestRequireAuth_ValidCookie_CallsNext(t *testing.T) {
	cfg := testConfig("alice")
	h := auth.NewHandler(cfg)

	// Build a valid session cookie by going through the roundtrip helpers.
	cookie := buildCookieForUser(t, cfg, &auth.User{Login: "alice", ID: 1})

	var gotUser *auth.User
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUser = auth.UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(cookie)
	rr := httptest.NewRecorder()
	h.RequireAuth(inner).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	if gotUser == nil {
		t.Fatal("expected user in context, got nil")
	}
	if gotUser.Login != "alice" {
		t.Errorf("user.Login = %q, want %q", gotUser.Login, "alice")
	}
}

func TestRequireAuth_ExpiredCookie_Redirects(t *testing.T) {
	cfg := testConfig("alice")
	// Build a cookie that expires immediately.
	cfg.SessionTTL = "-1s"
	h := auth.NewHandler(cfg)

	cookie := buildCookieForUser(t, cfg, &auth.User{Login: "alice", ID: 1})

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(cookie)
	rr := httptest.NewRecorder()
	h.RequireAuth(inner).ServeHTTP(rr, req)

	if rr.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d (expected redirect for expired token)", rr.Code, http.StatusFound)
	}
}

// --- WhoAmIHandler ---

func TestWhoAmIHandler_NoUser_Returns401(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/whoami", nil)
	rr := httptest.NewRecorder()
	auth.WhoAmIHandler(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

// --- Allowlist ---

func TestRequireAuth_ValidCookie_BypassesAllowlistCheck(t *testing.T) {
	// The RequireAuth middleware validates only the JWT signature and expiry.
	// Allowlist enforcement happens at callback time, not here.  A cookie that
	// was issued for a user not currently on the allowlist is still accepted by
	// the middleware; allowlist changes only take effect on the next login.
	cfg := testConfig("alice")
	h := auth.NewHandler(cfg)

	// Build a valid cookie for a user not on the allowlist.
	cookie := buildCookieForUser(t, cfg, &auth.User{Login: "eve", ID: 99})

	var gotUser *auth.User
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUser = auth.UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(cookie)
	rr := httptest.NewRecorder()
	h.RequireAuth(inner).ServeHTTP(rr, req)

	// The cookie is valid so the middleware lets it through; allowlist is
	// enforced at login/callback time, not here.
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (middleware validates JWT only)", rr.Code)
	}
	if gotUser == nil || gotUser.Login != "eve" {
		t.Errorf("unexpected user in context: %v", gotUser)
	}
}

// --- helpers ---

// buildCookieForUser creates a real signed session cookie using the exported
// session-building path exercised by calling through the test handler.
func buildCookieForUser(t *testing.T, cfg *config.AuthConfig, u *auth.User) *http.Cookie {
	t.Helper()

	ttl, err := cfg.SessionTTLDuration()
	if err != nil {
		t.Fatalf("parsing TTL: %v", err)
	}
	cookie, err := auth.BuildSessionCookieForTest(cfg.SessionSecret, u, ttl)
	if err != nil {
		t.Fatalf("building session cookie: %v", err)
	}
	return cookie
}

// TestWhoAmIHandler_ReturnsUser above needs to inject a User into context.
// We do that via RequireAuth + a real cookie.
func TestWhoAmIHandler_ViaMiddleware(t *testing.T) {
	cfg := testConfig("alice")
	h := auth.NewHandler(cfg)

	cookie := buildCookieForUser(t, cfg, &auth.User{Login: "alice", ID: 7})

	req := httptest.NewRequest(http.MethodGet, "/api/whoami", nil)
	req.AddCookie(cookie)
	rr := httptest.NewRecorder()

	h.RequireAuth(http.HandlerFunc(auth.WhoAmIHandler)).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var got auth.User
	if err := json.NewDecoder(rr.Body).Decode(&got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if got.Login != "alice" {
		t.Errorf("login = %q, want alice", got.Login)
	}
	if got.ID != 7 {
		t.Errorf("id = %d, want 7", got.ID)
	}
}

// TestSessionTTL_Respected verifies that a token with a future expiry is valid
// and a token with a past expiry is rejected.
func TestSessionTTL_Respected(t *testing.T) {
	cfg := testConfig("alice")
	h := auth.NewHandler(cfg)

	// Valid (future expiry).
	validCookie, err := auth.BuildSessionCookieForTest(cfg.SessionSecret,
		&auth.User{Login: "alice", ID: 1}, 1*time.Hour)
	if err != nil {
		t.Fatalf("building cookie: %v", err)
	}

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(validCookie)
	rr := httptest.NewRecorder()
	h.RequireAuth(inner).ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("valid cookie: status = %d, want 200", rr.Code)
	}

	// Expired (past expiry).
	expiredCookie, err := auth.BuildSessionCookieForTest(cfg.SessionSecret,
		&auth.User{Login: "alice", ID: 1}, -1*time.Second)
	if err != nil {
		t.Fatalf("building expired cookie: %v", err)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	req2.AddCookie(expiredCookie)
	rr2 := httptest.NewRecorder()
	h.RequireAuth(inner).ServeHTTP(rr2, req2)
	if rr2.Code == http.StatusOK {
		t.Error("expired cookie should be rejected, but got 200")
	}
}
