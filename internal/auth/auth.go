// Package auth implements GitHub OAuth authentication and JWT-based session
// management for the dev-console server.
package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/greghaynes/dev-console/internal/config"
)

const sessionCookieName = "dc_session"

// contextKey is an unexported type for context keys in this package.
type contextKey int

const userContextKey contextKey = 0

// User holds the authenticated GitHub user information stored in the session.
type User struct {
	Login string `json:"login"`
	ID    int64  `json:"id"`
}

// Handler holds the dependencies needed to serve auth-related HTTP routes.
type Handler struct {
	cfg *config.AuthConfig
}

// NewHandler returns a new Handler using the provided AuthConfig.
func NewHandler(cfg *config.AuthConfig) *Handler {
	return &Handler{cfg: cfg}
}

// LoginHandler redirects the browser to GitHub's OAuth authorization URL.
func (h *Handler) LoginHandler(w http.ResponseWriter, r *http.Request) {
	params := url.Values{}
	params.Set("client_id", h.cfg.GitHub.ClientID)
	params.Set("redirect_uri", h.cfg.GitHub.CallbackURL)
	params.Set("scope", "read:user")

	target := "https://github.com/login/oauth/authorize?" + params.Encode()
	http.Redirect(w, r, target, http.StatusFound)
}

// CallbackHandler exchanges the OAuth code for a GitHub access token, fetches
// the authenticated user, enforces the allowlist, and sets a signed session
// cookie.
func (h *Handler) CallbackHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing code parameter", http.StatusBadRequest)
		return
	}

	token, err := h.exchangeCodeForToken(r.Context(), code)
	if err != nil {
		http.Error(w, "failed to exchange OAuth code", http.StatusBadGateway)
		return
	}

	user, err := fetchGitHubUser(r.Context(), token)
	if err != nil {
		http.Error(w, "failed to fetch GitHub user", http.StatusBadGateway)
		return
	}

	if !h.isAllowed(user.Login) {
		http.Error(w, "user not authorised", http.StatusForbidden)
		return
	}

	ttl, err := h.cfg.SessionTTLDuration()
	if err != nil {
		http.Error(w, "invalid session TTL configuration", http.StatusInternalServerError)
		return
	}

	cookie, err := buildSessionCookie(h.cfg.SessionSecret, user, ttl)
	if err != nil {
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, cookie)
	http.Redirect(w, r, "/", http.StatusFound)
}

// LogoutHandler clears the session cookie.
func (h *Handler) LogoutHandler(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
	})
	http.Redirect(w, r, "/login", http.StatusFound)
}

// RequireAuth is middleware that validates the session cookie.  Authenticated
// user information is stored in the request context so downstream handlers can
// retrieve it with UserFromContext.  Unauthenticated requests are redirected to
// /login; API requests (path prefix /api/) receive a 401 instead.
func (h *Handler) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, err := h.userFromCookie(r)
		if err != nil {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				http.Error(w, "authentication required", http.StatusUnauthorized)
			} else {
				http.Redirect(w, r, "/login", http.StatusFound)
			}
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// WhoAmIHandler writes the authenticated user as JSON.
// Must be used behind RequireAuth.
func WhoAmIHandler(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(user); err != nil {
		http.Error(w, "encoding response", http.StatusInternalServerError)
	}
}

// UserFromContext returns the User stored in ctx by RequireAuth, or nil.
func UserFromContext(ctx context.Context) *User {
	u, _ := ctx.Value(userContextKey).(*User)
	return u
}

// isAllowed reports whether login is on the configured allowlist.
// If the list is empty, all authenticated users are allowed.
func (h *Handler) isAllowed(login string) bool {
	if len(h.cfg.AllowedGithubUsers) == 0 {
		return true
	}
	for _, allowed := range h.cfg.AllowedGithubUsers {
		if allowed == login {
			return true
		}
	}
	return false
}

// exchangeCodeForToken exchanges the GitHub OAuth code for an access token.
func (h *Handler) exchangeCodeForToken(ctx context.Context, code string) (string, error) {
	params := url.Values{}
	params.Set("client_id", h.cfg.GitHub.ClientID)
	params.Set("client_secret", h.cfg.GitHub.ClientSecret)
	params.Set("code", code)
	params.Set("redirect_uri", h.cfg.GitHub.CallbackURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://github.com/login/oauth/access_token",
		strings.NewReader(params.Encode()))
	if err != nil {
		return "", fmt.Errorf("building token request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("posting to GitHub token endpoint: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading token response body: %w", err)
	}

	var result struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("parsing token response: %w", err)
	}
	if result.Error != "" {
		return "", fmt.Errorf("GitHub OAuth error: %s", result.Error)
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("empty access token returned by GitHub")
	}
	return result.AccessToken, nil
}

// fetchGitHubUser calls the GitHub API to get the authenticated user's profile.
func fetchGitHubUser(ctx context.Context, accessToken string) (*User, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://api.github.com/user", nil)
	if err != nil {
		return nil, fmt.Errorf("building user request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling GitHub user API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub user API returned status %d", resp.StatusCode)
	}

	var u User
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, fmt.Errorf("decoding GitHub user response: %w", err)
	}
	if u.Login == "" {
		return nil, fmt.Errorf("GitHub user response missing login field")
	}
	return &u, nil
}

// sessionClaims are the JWT claims stored in the session cookie.
type sessionClaims struct {
	Login string `json:"login"`
	ID    int64  `json:"id"`
	jwt.RegisteredClaims
}

// BuildSessionCookieForTest is an exported wrapper around buildSessionCookie for
// use in package tests.
func BuildSessionCookieForTest(secret string, user *User, ttl time.Duration) (*http.Cookie, error) {
	return buildSessionCookie(secret, user, ttl)
}

// buildSessionCookie creates a signed JWT and wraps it in an HTTP-only cookie.
func buildSessionCookie(secret string, user *User, ttl time.Duration) (*http.Cookie, error) {
	now := time.Now()
	claims := sessionClaims{
		Login: user.Login,
		ID:    user.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return nil, fmt.Errorf("signing session JWT: %w", err)
	}

	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    signed,
		Path:     "/",
		Expires:  now.Add(ttl),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	}, nil
}

// userFromCookie validates the session cookie from r and returns the User.
func (h *Handler) userFromCookie(r *http.Request) (*User, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return nil, fmt.Errorf("no session cookie: %w", err)
	}

	var claims sessionClaims
	token, err := jwt.ParseWithClaims(cookie.Value, &claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(h.cfg.SessionSecret), nil
	})
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid session token: %w", err)
	}

	return &User{Login: claims.Login, ID: claims.ID}, nil
}
