// Package apiclient provides a typed Go client over the dev-console HTTP API
// for use in handler tests.  All requests are dispatched directly through an
// http.Handler via net/http/httptest, so no real TCP connection is required.
package apiclient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"

	"github.com/greghaynes/dev-console/internal/project"
	"github.com/greghaynes/dev-console/internal/workspace"
)

// StatusError is returned when the server responds with a non-2xx status code.
type StatusError struct {
	Code int
	Body string
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("HTTP %d: %s", e.Code, e.Body)
}

// IsNotFound reports whether err is a StatusError with code 404.
func IsNotFound(err error) bool {
	if err == nil {
		return false
	}
	se, ok := err.(*StatusError)
	return ok && se.Code == http.StatusNotFound
}

// Client wraps an http.Handler and exposes typed methods for the dev-console
// REST API.  No real TCP connection is made; all requests are dispatched
// directly through the handler using net/http/httptest.
type Client struct {
	handler http.Handler
}

// NewClient returns a Client backed by the given handler.
func NewClient(handler http.Handler) *Client {
	return &Client{handler: handler}
}

// do executes a request against the handler and returns the recorder.
func (c *Client) do(method, path string, body io.Reader) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, body)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rr := httptest.NewRecorder()
	c.handler.ServeHTTP(rr, req)
	return rr
}

// decode checks for a 2xx status and, when v is non-nil, unmarshals the JSON
// response body into v.  A non-2xx status is returned as a *StatusError.
func decode(rr *httptest.ResponseRecorder, v any) error {
	if rr.Code < 200 || rr.Code >= 300 {
		return &StatusError{Code: rr.Code, Body: rr.Body.String()}
	}
	if v == nil {
		return nil
	}
	return json.NewDecoder(rr.Body).Decode(v)
}

// ListProjects returns all projects.
func (c *Client) ListProjects() ([]project.Project, error) {
	rr := c.do(http.MethodGet, "/api/projects", nil)
	var projects []project.Project
	if err := decode(rr, &projects); err != nil {
		return nil, err
	}
	return projects, nil
}

// CreateProject creates a project with the given repoURL and returns it.
func (c *Client) CreateProject(repoURL string) (*project.Project, error) {
	// json.Marshal on map[string]string never returns an error.
	body, _ := json.Marshal(map[string]string{"repoURL": repoURL})
	rr := c.do(http.MethodPost, "/api/projects", bytes.NewReader(body))
	var p project.Project
	if err := decode(rr, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// GetProject returns the project with the given ID.
func (c *Client) GetProject(pid string) (*project.Project, error) {
	rr := c.do(http.MethodGet, "/api/projects/"+url.PathEscape(pid), nil)
	var p project.Project
	if err := decode(rr, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// DeleteProject removes the project with the given ID.
func (c *Client) DeleteProject(pid string) error {
	rr := c.do(http.MethodDelete, "/api/projects/"+url.PathEscape(pid), nil)
	return decode(rr, nil)
}

// ListWorkspaces returns all workspaces for the given project.
func (c *Client) ListWorkspaces(pid string) ([]workspace.Workspace, error) {
	rr := c.do(http.MethodGet, "/api/projects/"+url.PathEscape(pid)+"/workspaces", nil)
	var workspaces []workspace.Workspace
	if err := decode(rr, &workspaces); err != nil {
		return nil, err
	}
	return workspaces, nil
}

// CreateWorkspace creates a workspace on branch for the given project and
// returns it.  name defaults to branch when empty.
func (c *Client) CreateWorkspace(pid, branch, name string) (*workspace.Workspace, error) {
	// json.Marshal on map[string]string never returns an error.
	body, _ := json.Marshal(map[string]string{"branch": branch, "name": name})
	rr := c.do(http.MethodPost, "/api/projects/"+url.PathEscape(pid)+"/workspaces", bytes.NewReader(body))
	var ws workspace.Workspace
	if err := decode(rr, &ws); err != nil {
		return nil, err
	}
	return &ws, nil
}

// GetWorkspace returns the workspace identified by (pid, wid).
func (c *Client) GetWorkspace(pid, wid string) (*workspace.Workspace, error) {
	rr := c.do(http.MethodGet, "/api/projects/"+url.PathEscape(pid)+"/workspaces/"+url.PathEscape(wid), nil)
	var ws workspace.Workspace
	if err := decode(rr, &ws); err != nil {
		return nil, err
	}
	return &ws, nil
}

// DeleteWorkspace removes the workspace identified by (pid, wid).
func (c *Client) DeleteWorkspace(pid, wid string) error {
	rr := c.do(http.MethodDelete, "/api/projects/"+url.PathEscape(pid)+"/workspaces/"+url.PathEscape(wid), nil)
	return decode(rr, nil)
}

// ListDirEntries returns the directory entries at relPath inside the workspace.
// Pass an empty relPath to list the workspace root.
func (c *Client) ListDirEntries(pid, wid, relPath string) ([]workspace.DirEntry, error) {
	u := "/api/projects/" + url.PathEscape(pid) + "/workspaces/" + url.PathEscape(wid) + "/files"
	if relPath != "" {
		u += "?path=" + url.QueryEscape(relPath)
	}
	rr := c.do(http.MethodGet, u, nil)
	var entries []workspace.DirEntry
	if err := decode(rr, &entries); err != nil {
		return nil, err
	}
	return entries, nil
}

// GetFile returns the raw content of the file at relPath inside the workspace.
func (c *Client) GetFile(pid, wid, relPath string) (string, error) {
	u := "/api/projects/" + url.PathEscape(pid) + "/workspaces/" + url.PathEscape(wid) + "/file?path=" + url.QueryEscape(relPath)
	rr := c.do(http.MethodGet, u, nil)
	if err := decode(rr, nil); err != nil {
		return "", err
	}
	return rr.Body.String(), nil
}

// CreateTerminal creates a terminal session for the given workspace and returns
// the terminal ID.
func (c *Client) CreateTerminal(pid, wid string) (string, error) {
	rr := c.do(http.MethodPost, "/api/projects/"+url.PathEscape(pid)+"/workspaces/"+url.PathEscape(wid)+"/terminals", nil)
	var resp struct {
		TerminalID string `json:"terminalId"`
	}
	if err := decode(rr, &resp); err != nil {
		return "", err
	}
	return resp.TerminalID, nil
}
