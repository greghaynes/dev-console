package config_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/greghaynes/dev-console/internal/config"
)

// writeTemp writes content to a temporary file and returns its path.
func writeTemp(t *testing.T, content string) string {
	t.Helper()
	f, err := os.CreateTemp(t.TempDir(), "dev-console-*.yaml")
	if err != nil {
		t.Fatalf("creating temp file: %v", err)
	}
	if _, err := f.WriteString(content); err != nil {
		t.Fatalf("writing temp file: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("closing temp file: %v", err)
	}
	return f.Name()
}

func TestLoad_MinimalValid(t *testing.T) {
	yaml := `
server:
  listenAddr: ":8080"
`
	path := writeTemp(t, yaml)
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Server.ListenAddr != ":8080" {
		t.Errorf("listenAddr = %q, want %q", cfg.Server.ListenAddr, ":8080")
	}
}

func TestLoad_MissingListenAddr(t *testing.T) {
	yaml := `
server:
  tls:
    certFile: /tmp/cert.pem
`
	path := writeTemp(t, yaml)
	_, err := config.Load(path)
	if err == nil {
		t.Fatal("expected error for missing listenAddr, got nil")
	}
}

func TestLoad_FullConfig(t *testing.T) {
	yaml := `
server:
  listenAddr: ":9090"
  tls:
    certFile: /etc/tls/cert.pem
    keyFile: /etc/tls/key.pem

auth:
  github:
    clientId: "myClientId"
    clientSecret: "myClientSecret"
    callbackUrl: "https://example.com/callback"
  allowedGithubUsers:
    - alice
    - bob
  sessionSecret: "supersecret"
  sessionTtl: "12h"

llm:
  provider: openai
  apiKey: sk-test
  model: gpt-4o
  allowedCommands:
    - go
    - npm

workspaces:
  - id: proj1
    name: Project One
    rootPath: /srv/workspaces/proj1
  - id: proj2
    name: Project Two
    rootPath: /srv/workspaces/proj2
`
	path := writeTemp(t, yaml)
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Server.ListenAddr != ":9090" {
		t.Errorf("listenAddr = %q", cfg.Server.ListenAddr)
	}
	if cfg.Server.TLS.CertFile != "/etc/tls/cert.pem" {
		t.Errorf("tls.certFile = %q", cfg.Server.TLS.CertFile)
	}
	if cfg.Auth.GitHub.ClientID != "myClientId" {
		t.Errorf("github.clientId = %q", cfg.Auth.GitHub.ClientID)
	}
	if len(cfg.Auth.AllowedGithubUsers) != 2 {
		t.Errorf("allowedGithubUsers count = %d, want 2", len(cfg.Auth.AllowedGithubUsers))
	}
	if cfg.Auth.AllowedGithubUsers[0] != "alice" {
		t.Errorf("allowedGithubUsers[0] = %q", cfg.Auth.AllowedGithubUsers[0])
	}
	if cfg.LLM.Provider != "openai" {
		t.Errorf("llm.provider = %q", cfg.LLM.Provider)
	}
	if len(cfg.LLM.AllowedCommands) != 2 {
		t.Errorf("llm.allowedCommands count = %d, want 2", len(cfg.LLM.AllowedCommands))
	}
	if len(cfg.Workspaces) != 2 {
		t.Errorf("workspaces count = %d, want 2", len(cfg.Workspaces))
	}
	if cfg.Workspaces[0].ID != "proj1" {
		t.Errorf("workspaces[0].id = %q", cfg.Workspaces[0].ID)
	}
}

func TestLoad_EnvVarSubstitution(t *testing.T) {
	t.Setenv("TEST_SECRET", "env-secret-value")
	t.Setenv("TEST_API_KEY", "env-api-key")

	yaml := `
server:
  listenAddr: ":8080"
auth:
  sessionSecret: "${TEST_SECRET}"
llm:
  apiKey: "${TEST_API_KEY}"
`
	path := writeTemp(t, yaml)
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Auth.SessionSecret != "env-secret-value" {
		t.Errorf("sessionSecret = %q, want %q", cfg.Auth.SessionSecret, "env-secret-value")
	}
	if cfg.LLM.APIKey != "env-api-key" {
		t.Errorf("llm.apiKey = %q, want %q", cfg.LLM.APIKey, "env-api-key")
	}
}

func TestLoad_EnvVarUnset(t *testing.T) {
	// Ensure variable is unset.
	t.Setenv("UNSET_VAR_XYZ", "")
	os.Unsetenv("UNSET_VAR_XYZ")

	yaml := `
server:
  listenAddr: ":8080"
auth:
  sessionSecret: "${UNSET_VAR_XYZ}"
`
	path := writeTemp(t, yaml)
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Unset env vars expand to empty string.
	if cfg.Auth.SessionSecret != "" {
		t.Errorf("sessionSecret = %q, want empty string", cfg.Auth.SessionSecret)
	}
}

func TestLoad_FileNotFound(t *testing.T) {
	_, err := config.Load(filepath.Join(t.TempDir(), "nonexistent.yaml"))
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestLoad_InvalidYAML(t *testing.T) {
	path := writeTemp(t, "server: [invalid: yaml: here")
	_, err := config.Load(path)
	if err == nil {
		t.Fatal("expected error for invalid YAML, got nil")
	}
}

func TestSessionTTLDuration_Default(t *testing.T) {
	a := &config.AuthConfig{}
	d, err := a.SessionTTLDuration()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d != 24*time.Hour {
		t.Errorf("default TTL = %v, want 24h", d)
	}
}

func TestSessionTTLDuration_Custom(t *testing.T) {
	a := &config.AuthConfig{SessionTTL: "48h"}
	d, err := a.SessionTTLDuration()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d != 48*time.Hour {
		t.Errorf("TTL = %v, want 48h", d)
	}
}

func TestSessionTTLDuration_Invalid(t *testing.T) {
	a := &config.AuthConfig{SessionTTL: "notaduration"}
	_, err := a.SessionTTLDuration()
	if err == nil {
		t.Fatal("expected error for invalid duration, got nil")
	}
}
