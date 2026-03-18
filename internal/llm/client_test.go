package llm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// sseBody builds a minimal SSE payload from the given text chunks.
func sseBody(chunks ...string) string {
	var sb strings.Builder
	for _, c := range chunks {
		sb.WriteString(`data: {"choices":[{"delta":{"content":`)
		sb.WriteString(`"` + c + `"`)
		sb.WriteString(`},"finish_reason":null}]}`)
		sb.WriteString("\n\n")
	}
	sb.WriteString("data: [DONE]\n\n")
	return sb.String()
}

// sseToolBody builds an SSE payload for a single tool call (list_files).
func sseToolBody() string {
	lines := []string{
		// first chunk: open the tool call, name
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"list_files","arguments":""}}]},"finish_reason":null}]}`,
		// second chunk: arguments fragment 1
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"path\":"}}]},"finish_reason":null}]}`,
		// third chunk: arguments fragment 2
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"\"}"}}]},"finish_reason":"tool_calls"}]}`,
		`data: [DONE]`,
	}
	return strings.Join(lines, "\n\n") + "\n\n"
}

func TestStreamChat_TextChunks(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(sseBody("Hello", ", ", "world", "!")))
	}))
	defer srv.Close()

	c := New(srv.URL, "test-key", "test-model")

	var got []string
	result, err := c.StreamChat(context.Background(), []Message{
		{Role: "user", Content: "say hello"},
	}, nil, func(chunk string) error {
		got = append(got, chunk)
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat returned error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil StreamResult")
	}
	if len(result.ToolCalls) != 0 {
		t.Errorf("expected no tool calls, got %d", len(result.ToolCalls))
	}

	assembled := strings.Join(got, "")
	if assembled != "Hello, world!" {
		t.Errorf("assembled text = %q; want %q", assembled, "Hello, world!")
	}
}

func TestStreamChat_ToolCall(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(sseToolBody()))
	}))
	defer srv.Close()

	c := New(srv.URL, "", "test-model")

	var chunks []string
	result, err := c.StreamChat(context.Background(), []Message{
		{Role: "user", Content: "list files"},
	}, nil, func(chunk string) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat returned error: %v", err)
	}
	if len(chunks) != 0 {
		t.Errorf("expected no text chunks for tool call response, got %v", chunks)
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(result.ToolCalls))
	}
	tc := result.ToolCalls[0]
	if tc.ID != "call_1" {
		t.Errorf("tool call ID = %q; want %q", tc.ID, "call_1")
	}
	if tc.Function.Name != "list_files" {
		t.Errorf("tool call name = %q; want %q", tc.Function.Name, "list_files")
	}
	wantArgs := `{"path":""}`
	if tc.Function.Arguments != wantArgs {
		t.Errorf("tool call arguments = %q; want %q", tc.Function.Arguments, wantArgs)
	}
}

func TestStreamChat_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}))
	defer srv.Close()

	c := New(srv.URL, "", "test-model")
	_, err := c.StreamChat(context.Background(), nil, nil, func(_ string) error { return nil })
	if err == nil {
		t.Fatal("expected error for non-200 response, got nil")
	}
}
