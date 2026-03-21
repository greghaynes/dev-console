// Command dev-console starts the Dev Console server.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"

	"github.com/greghaynes/dev-console/internal/agent"
	"github.com/greghaynes/dev-console/internal/auth"
	"github.com/greghaynes/dev-console/internal/config"
	"github.com/greghaynes/dev-console/internal/llm"
	"github.com/greghaynes/dev-console/internal/project"
	"github.com/greghaynes/dev-console/internal/spa"
	"github.com/greghaynes/dev-console/internal/terminal"
	"github.com/greghaynes/dev-console/internal/workspace"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "dev-console: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	var configPath string
	flag.StringVar(&configPath, "config", "dev-console.yaml", "path to YAML configuration file")
	flag.Parse()

	cfg, err := config.Load(configPath)
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	router := buildRouter(cfg)

	srv := &http.Server{
		Addr:    cfg.Server.ListenAddr,
		Handler: router,
		// ReadTimeout and WriteTimeout are intentionally generous to support
		// long-lived WebSocket connections (terminal sessions).
		ReadTimeout:  0,
		WriteTimeout: 0,
		IdleTimeout:  120 * time.Second,
	}

	// Start the server in a background goroutine so we can listen for signals.
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("dev-console listening on %s", cfg.Server.ListenAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
		close(serverErr)
	}()

	// Wait for a termination signal or a server error.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-quit:
		log.Printf("received signal %s, shutting down gracefully…", sig)
	case err := <-serverErr:
		if err != nil {
			return fmt.Errorf("server error: %w", err)
		}
		return nil
	}

	// Graceful shutdown: give in-flight requests up to 30 s to complete.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		return fmt.Errorf("graceful shutdown failed: %w", err)
	}

	log.Println("server stopped")
	return nil
}

// buildRouter constructs the HTTP router with all registered routes.
// Additional routes will be added as subsequent phases are implemented.
func buildRouter(cfg *config.Config) *mux.Router {
	r := mux.NewRouter()

	// Health-check endpoint (unauthenticated; useful for load balancers).
	r.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	}).Methods(http.MethodGet)

	authHandler := auth.NewHandler(&cfg.Auth)

	// OAuth routes (unauthenticated).
	r.HandleFunc("/auth/login", authHandler.LoginHandler).Methods(http.MethodGet)
	r.HandleFunc("/auth/callback", authHandler.CallbackHandler).Methods(http.MethodGet)
	r.HandleFunc("/auth/logout", authHandler.LogoutHandler).Methods(http.MethodPost)

	// Protected API routes.
	api := r.PathPrefix("/api").Subrouter()
	api.Use(authHandler.RequireAuth)
	api.HandleFunc("/whoami", auth.WhoAmIHandler).Methods(http.MethodGet)

	// GitHub repos proxy (requires OAuth token stored in session).
	api.HandleFunc("/github/repos", githubReposHandler).Methods(http.MethodGet)

	// Project and workspace management (Phase 1.7).
	pm := project.NewManager(cfg.Storage.ProjectsDir)
	wm := workspace.NewManager()
	tm := terminal.NewManager()

	project.RegisterRoutes(api, pm, func(projectID string) error {
		return wm.DeleteAll(projectID)
	})
	workspace.RegisterRoutes(api, wm, pm)
	terminal.RegisterRoutes(api, tm, wm, pm)

	// Agent chat sessions (Phase 3).
	llmClient := llm.New(cfg.LLM.BaseURL, cfg.LLM.APIKey, cfg.LLM.Model)
	am := agent.NewManager(llmClient, wm)
	agent.RegisterRoutes(api, am, wm, pm)

	// Serve the embedded SPA for all other routes (Phase 1.9).
	// This must be registered last so that the more specific routes above
	// take precedence.
	r.PathPrefix("/").Handler(spa.Handler())

	return r
}

// githubReposHandler proxies GET /api/github/repos by calling the GitHub API
// with the OAuth token stored in the session cookie.
func githubReposHandler(w http.ResponseWriter, r *http.Request) {
	oauthToken := auth.OAuthTokenFromContext(r.Context())
	if oauthToken == "" {
		http.Error(w, "no GitHub token in session", http.StatusUnauthorized)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet,
		"https://api.github.com/user/repos?per_page=100&sort=updated", nil)
	if err != nil {
		http.Error(w, "building GitHub request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Authorization", "Bearer "+oauthToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "calling GitHub API: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, "GitHub API returned "+resp.Status, http.StatusBadGateway)
		return
	}

	// Decode GitHub's response and normalize field names.
	var ghRepos []struct {
		ID          int64  `json:"id"`
		FullName    string `json:"full_name"`
		Description string `json:"description"`
		Language    string `json:"language"`
		UpdatedAt   string `json:"updated_at"`
		HTMLURL     string `json:"html_url"`
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "reading GitHub response", http.StatusBadGateway)
		return
	}
	if err := json.Unmarshal(body, &ghRepos); err != nil {
		http.Error(w, "parsing GitHub response", http.StatusBadGateway)
		return
	}

	type repoItem struct {
		ID          int64  `json:"id"`
		FullName    string `json:"fullName"`
		Description string `json:"description"`
		Language    string `json:"language"`
		UpdatedAt   string `json:"updatedAt"`
		HTMLURL     string `json:"htmlURL"`
	}
	out := make([]repoItem, len(ghRepos))
	for i, gh := range ghRepos {
		out[i] = repoItem{
			ID:          gh.ID,
			FullName:    gh.FullName,
			Description: gh.Description,
			Language:    gh.Language,
			UpdatedAt:   gh.UpdatedAt,
			HTMLURL:     gh.HTMLURL,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(out); err != nil {
		http.Error(w, "encoding response", http.StatusInternalServerError)
	}
}
