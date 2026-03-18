// Package agent manages AI assistant sessions scoped to a workspace.  Each
// session holds a conversation history and can execute a turn against an LLM
// using read-only workspace tools (list_files, read_file).
package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/greghaynes/dev-console/internal/llm"
	"github.com/greghaynes/dev-console/internal/slug"
	"github.com/greghaynes/dev-console/internal/workspace"
)

// ErrNotFound is returned when a session does not exist.
var ErrNotFound = errors.New("session not found")

// systemPrompt is sent as the first message in every agent turn.
const systemPrompt = `You are a helpful coding assistant with read-only access to workspace files.
Use the list_files tool to explore the directory structure and the read_file tool to read file contents.
Answer questions about the code concisely and accurately.`

// tools defines the read-only tools available to the agent.
var tools = []llm.Tool{
	{
		Type: "function",
		Function: llm.ToolFunction{
			Name:        "list_files",
			Description: "List files and directories at a path within the workspace. Returns a JSON array of {name, type} objects.",
			Parameters:  json.RawMessage(`{"type":"object","properties":{"path":{"type":"string","description":"Directory path relative to workspace root. Use empty string for root."}},"required":[]}`),
		},
	},
	{
		Type: "function",
		Function: llm.ToolFunction{
			Name:        "read_file",
			Description: "Read the contents of a file within the workspace.",
			Parameters:  json.RawMessage(`{"type":"object","properties":{"path":{"type":"string","description":"File path relative to workspace root."}},"required":["path"]}`),
		},
	},
}

// Session holds the state for a single agent conversation.
type Session struct {
	ID          string        `json:"id"`
	ProjectID   string        `json:"projectId"`
	WorkspaceID string        `json:"workspaceId"`
	CreatedAt   time.Time     `json:"createdAt"`
	History     []llm.Message `json:"history"`

	mu     sync.Mutex
	cancel context.CancelFunc // cancels the current agent turn, if any
}

// Manager is a thread-safe registry of agent sessions scoped per workspace.
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]map[string]*Session // "pid/wid" → id → session

	llmClient *llm.Client
	wm        *workspace.Manager
}

// NewManager returns a new Manager backed by the given LLM client and
// workspace manager.
func NewManager(llmClient *llm.Client, wm *workspace.Manager) *Manager {
	return &Manager{
		sessions:  make(map[string]map[string]*Session),
		llmClient: llmClient,
		wm:        wm,
	}
}

func sessionKey(projectID, workspaceID string) string {
	return projectID + "/" + workspaceID
}

// Create allocates a new agent session for the given project and workspace.
func (m *Manager) Create(projectID, workspaceID string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	key := sessionKey(projectID, workspaceID)
	if m.sessions[key] == nil {
		m.sessions[key] = make(map[string]*Session)
	}

	id := slug.Generate("s", func(s string) bool {
		_, ok := m.sessions[key][s]
		return ok
	})

	sess := &Session{
		ID:          id,
		ProjectID:   projectID,
		WorkspaceID: workspaceID,
		CreatedAt:   time.Now().UTC(),
		History:     []llm.Message{},
	}
	m.sessions[key][id] = sess
	return sess, nil
}

// Get returns the session identified by (projectID, workspaceID, id).
func (m *Manager) Get(projectID, workspaceID, id string) (*Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	key := sessionKey(projectID, workspaceID)
	ws := m.sessions[key]
	if ws == nil {
		return nil, ErrNotFound
	}
	sess, ok := ws[id]
	if !ok {
		return nil, ErrNotFound
	}
	return sess, nil
}

// List returns all sessions for the given project and workspace.
func (m *Manager) List(projectID, workspaceID string) []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	key := sessionKey(projectID, workspaceID)
	ws := m.sessions[key]
	if ws == nil {
		return []*Session{}
	}
	out := make([]*Session, 0, len(ws))
	for _, s := range ws {
		out = append(out, s)
	}
	return out
}

// Delete removes a session.
func (m *Manager) Delete(projectID, workspaceID, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	key := sessionKey(projectID, workspaceID)
	ws := m.sessions[key]
	if ws == nil {
		return ErrNotFound
	}
	sess, ok := ws[id]
	if !ok {
		return ErrNotFound
	}
	// Cancel any in-flight turn.
	sess.mu.Lock()
	if sess.cancel != nil {
		sess.cancel()
	}
	sess.mu.Unlock()
	delete(ws, id)
	return nil
}

// TurnEvent is the discriminated union of frames emitted during an agent turn.
type TurnEvent struct {
	Type      string `json:"type"`
	Content   string `json:"content,omitempty"`
	ID        string `json:"id,omitempty"`
	Name      string `json:"name,omitempty"`
	Arguments string `json:"arguments,omitempty"`
	Message   string `json:"message,omitempty"`
}

// RunTurn appends userContent to the session history, calls the LLM, executes
// any tool calls, and streams events to send.  The turn is cancellable via the
// session's stored cancel function; callers should pass a parent context and
// rely on session.Cancel() for user-initiated cancellation.
func (m *Manager) RunTurn(ctx context.Context, sess *Session, userContent string, send func(TurnEvent) error) error {
	// Append the user message to history.
	sess.mu.Lock()
	sess.History = append(sess.History, llm.Message{
		Role:    "user",
		Content: userContent,
	})
	// Wrap context with a cancel so the session can be interrupted.
	turnCtx, cancel := context.WithCancel(ctx)
	sess.cancel = cancel
	sess.mu.Unlock()
	defer cancel()

	// Look up workspace root for tool execution.
	ws, err := m.wm.Get(sess.ProjectID, sess.WorkspaceID)
	if err != nil {
		return fmt.Errorf("looking up workspace: %w", err)
	}
	wsRoot := ws.RootPath

	// Prepend the system prompt for the API call (not stored in history).
	for {
		messages := buildAPIMessages(sess)
		var assistantContent strings.Builder
		var toolCallsSeen []llm.ToolCall

		result, err := m.llmClient.StreamChat(turnCtx, messages, tools, func(chunk string) error {
			assistantContent.WriteString(chunk)
			return send(TurnEvent{Type: "assistant_chunk", Content: chunk})
		})
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return nil
			}
			return fmt.Errorf("LLM streaming: %w", err)
		}
		toolCallsSeen = result.ToolCalls

		// Record what the assistant said so far.
		assistantMsg := llm.Message{
			Role:      "assistant",
			Content:   assistantContent.String(),
			ToolCalls: toolCallsSeen,
		}
		sess.mu.Lock()
		sess.History = append(sess.History, assistantMsg)
		sess.mu.Unlock()

		// If no tool calls were requested, the turn is complete.
		if len(toolCallsSeen) == 0 {
			return send(TurnEvent{Type: "assistant_done"})
		}

		// Execute each tool and append results.
		for _, tc := range toolCallsSeen {
			// Emit tool_call frame so the UI can show what the agent is doing.
			if err := send(TurnEvent{
				Type:      "tool_call",
				ID:        tc.ID,
				Name:      tc.Function.Name,
				Arguments: tc.Function.Arguments,
			}); err != nil {
				return err
			}

			toolResult, toolErr := executeTool(tc.Function.Name, tc.Function.Arguments, wsRoot)
			if toolErr != nil {
				toolResult = fmt.Sprintf("error: %v", toolErr)
			}

			if err := send(TurnEvent{
				Type:    "tool_result",
				ID:      tc.ID,
				Content: toolResult,
			}); err != nil {
				return err
			}

			// Append the tool result to history.
			sess.mu.Lock()
			sess.History = append(sess.History, llm.Message{
				Role:       "tool",
				Content:    toolResult,
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			})
			sess.mu.Unlock()
		}
		// Loop: call the LLM again with the updated history.
	}
}

// Cancel stops any in-flight agent turn for the session.
func (s *Session) Cancel() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
}

// buildAPIMessages prepends the system prompt to the session's stored history.
func buildAPIMessages(sess *Session) []llm.Message {
	sess.mu.Lock()
	defer sess.mu.Unlock()

	msgs := make([]llm.Message, 0, len(sess.History)+1)
	msgs = append(msgs, llm.Message{Role: "system", Content: systemPrompt})
	msgs = append(msgs, sess.History...)
	return msgs
}

// executeTool dispatches a tool call by name and returns the result as a string.
func executeTool(name, argsJSON, wsRoot string) (string, error) {
	switch name {
	case "list_files":
		return execListFiles(argsJSON, wsRoot)
	case "read_file":
		return execReadFile(argsJSON, wsRoot)
	default:
		return "", fmt.Errorf("unknown tool: %s", name)
	}
}

// execListFiles handles the list_files tool.
func execListFiles(argsJSON, wsRoot string) (string, error) {
	var args struct {
		Path string `json:"path"`
	}
	if argsJSON != "" {
		if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
			return "", fmt.Errorf("parsing list_files arguments: %w", err)
		}
	}

	absPath, err := safeJoin(wsRoot, args.Path)
	if err != nil {
		return "", err
	}

	entries, err := os.ReadDir(absPath)
	if err != nil {
		return "", fmt.Errorf("reading directory: %w", err)
	}

	type entry struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	result := make([]entry, 0, len(entries))
	for _, e := range entries {
		t := "file"
		if e.IsDir() {
			t = "dir"
		}
		result = append(result, entry{Name: e.Name(), Type: t})
	}

	b, err := json.Marshal(result)
	if err != nil {
		return "", fmt.Errorf("encoding result: %w", err)
	}
	return string(b), nil
}

// execReadFile handles the read_file tool.
func execReadFile(argsJSON, wsRoot string) (string, error) {
	var args struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", fmt.Errorf("parsing read_file arguments: %w", err)
	}
	if args.Path == "" {
		return "", fmt.Errorf("path is required")
	}

	absPath, err := safeJoin(wsRoot, args.Path)
	if err != nil {
		return "", err
	}

	data, err := os.ReadFile(absPath) // #nosec G304 -- path validated by safeJoin against workspace root
	if err != nil {
		return "", fmt.Errorf("reading file: %w", err)
	}
	return string(data), nil
}

// safeJoin resolves a client-supplied relative path against wsRoot and ensures
// the result remains within the workspace root (path-traversal protection).
func safeJoin(wsRoot, relPath string) (string, error) {
	if relPath == "" {
		return wsRoot, nil
	}
	abs, err := filepath.Abs(filepath.Join(wsRoot, relPath))
	if err != nil {
		return "", err
	}
	root := filepath.Clean(wsRoot)
	if abs != root && !strings.HasPrefix(abs, root+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes workspace root")
	}
	return abs, nil
}
