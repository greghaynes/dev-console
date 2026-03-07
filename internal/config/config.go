// Package config provides YAML-based configuration loading with environment
// variable substitution for the dev-console server.
package config

import (
	"fmt"
	"os"
	"regexp"
	"time"

	"gopkg.in/yaml.v3"
)

// envVarPattern matches ${ENV_VAR} placeholders in config values.
var envVarPattern = regexp.MustCompile(`\$\{([^}]+)\}`)

// Config is the top-level configuration structure.
type Config struct {
	Server     ServerConfig     `yaml:"server"`
	Auth       AuthConfig       `yaml:"auth"`
	LLM        LLMConfig        `yaml:"llm"`
	Workspaces []WorkspaceEntry `yaml:"workspaces"`
}

// ServerConfig holds HTTP server settings.
type ServerConfig struct {
	ListenAddr string    `yaml:"listenAddr"`
	TLS        TLSConfig `yaml:"tls"`
}

// TLSConfig holds optional TLS certificate paths.
type TLSConfig struct {
	CertFile string `yaml:"certFile"`
	KeyFile  string `yaml:"keyFile"`
}

// AuthConfig holds GitHub OAuth and session settings.
type AuthConfig struct {
	GitHub              GitHubOAuthConfig `yaml:"github"`
	AllowedGithubUsers  []string          `yaml:"allowedGithubUsers"`
	SessionSecret       string            `yaml:"sessionSecret"`
	SessionTTL          string            `yaml:"sessionTtl"`
}

// SessionTTLDuration parses SessionTTL and returns a time.Duration.
// It returns a default of 24 hours if the field is empty.
func (a *AuthConfig) SessionTTLDuration() (time.Duration, error) {
	if a.SessionTTL == "" {
		return 24 * time.Hour, nil
	}
	return time.ParseDuration(a.SessionTTL)
}

// GitHubOAuthConfig holds the GitHub OAuth application credentials.
type GitHubOAuthConfig struct {
	ClientID     string `yaml:"clientId"`
	ClientSecret string `yaml:"clientSecret"`
	CallbackURL  string `yaml:"callbackUrl"`
}

// LLMConfig holds settings for the LLM provider.
type LLMConfig struct {
	Provider        string   `yaml:"provider"`
	APIKey          string   `yaml:"apiKey"`
	Model           string   `yaml:"model"`
	AllowedCommands []string `yaml:"allowedCommands"`
}

// WorkspaceEntry describes a single registered workspace.
type WorkspaceEntry struct {
	ID       string `yaml:"id"`
	Name     string `yaml:"name"`
	RootPath string `yaml:"rootPath"`
}

// Load reads a YAML configuration file from path, expands any ${ENV_VAR}
// placeholders in string values, and returns the parsed Config.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading config file %q: %w", path, err)
	}

	expanded := expandEnvVars(string(data))

	var cfg Config
	if err := yaml.Unmarshal([]byte(expanded), &cfg); err != nil {
		return nil, fmt.Errorf("parsing config file %q: %w", path, err)
	}

	if err := cfg.validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return &cfg, nil
}

// expandEnvVars replaces all ${VAR} placeholders in s with the corresponding
// environment variable values. Unset variables are replaced with an empty string.
func expandEnvVars(s string) string {
	return envVarPattern.ReplaceAllStringFunc(s, func(match string) string {
		// Extract the variable name from ${VAR}.
		name := match[2 : len(match)-1]
		return os.Getenv(name)
	})
}

// validate checks that the required fields are present.
func (c *Config) validate() error {
	if c.Server.ListenAddr == "" {
		return fmt.Errorf("server.listenAddr must not be empty")
	}
	return nil
}
