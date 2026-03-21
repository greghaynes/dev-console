// Package llm provides a thin streaming HTTP client over the OpenAI Chat
// Completions API.  The base URL, model, and API key are configurable so the
// client works with OpenAI, Anthropic's OpenAI-compatible endpoint, or Ollama.
package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const defaultBaseURL = "https://api.openai.com/v1"

// Message represents a single message in a chat conversation.
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
}

// Tool describes a function the LLM may call.
type Tool struct {
	Type     string       `json:"type"` // always "function"
	Function ToolFunction `json:"function"`
}

// ToolFunction holds the schema for a callable function.
type ToolFunction struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}

// ToolCall represents a tool call requested by the LLM.
type ToolCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"` // always "function"
	Function ToolCallFunction `json:"function"`
}

// ToolCallFunction holds the name and JSON-encoded arguments of a tool call.
type ToolCallFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // raw JSON string
}

// StreamResult is returned by StreamChat and contains any tool calls requested
// by the LLM during the turn.
type StreamResult struct {
	ToolCalls []ToolCall
}

// Client is a streaming HTTP client for the OpenAI Chat Completions API.
type Client struct {
	baseURL    string
	apiKey     string
	model      string
	httpClient *http.Client
}

// New creates a new Client.  If baseURL is empty the OpenAI default is used.
func New(baseURL, apiKey, model string) *Client {
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		apiKey:     apiKey,
		model:      model,
		httpClient: &http.Client{},
	}
}

// StreamChat calls the Chat Completions endpoint in streaming mode.
// onChunk is called for each text content delta as it arrives.
// When the response includes tool calls the function collects them and returns
// them in the StreamResult; onChunk will not be called for tool call content.
func (c *Client) StreamChat(ctx context.Context, messages []Message, tools []Tool, onChunk func(string) error) (*StreamResult, error) {
	type requestBody struct {
		Model    string    `json:"model"`
		Messages []Message `json:"messages"`
		Tools    []Tool    `json:"tools,omitempty"`
		Stream   bool      `json:"stream"`
	}

	body := requestBody{
		Model:    c.model,
		Messages: messages,
		Stream:   true,
	}
	if len(tools) > 0 {
		body.Tools = tools
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshaling request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sending request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("LLM API returned %s: %s", resp.Status, string(errBody))
	}

	return parseStream(resp.Body, onChunk)
}

// parseStream reads the SSE response body, calls onChunk for each text delta,
// and accumulates tool call fragments into a StreamResult.
func parseStream(r io.Reader, onChunk func(string) error) (*StreamResult, error) {
	// tcAccum holds the incrementally-assembled fields for one tool call.
	type tcAccum struct {
		id        string
		tcType    string
		name      string
		arguments strings.Builder
	}
	accum := map[int]*tcAccum{}

	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string `json:"content"`
					ToolCalls []struct {
						Index    int    `json:"index"`
						ID       string `json:"id"`
						Type     string `json:"type"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue // skip malformed chunks
		}

		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				if err := onChunk(choice.Delta.Content); err != nil {
					return nil, fmt.Errorf("chunk callback: %w", err)
				}
			}
			for _, tc := range choice.Delta.ToolCalls {
				a, ok := accum[tc.Index]
				if !ok {
					a = &tcAccum{}
					accum[tc.Index] = a
				}
				if tc.ID != "" {
					a.id = tc.ID
				}
				if tc.Type != "" {
					a.tcType = tc.Type
				}
				if tc.Function.Name != "" {
					a.name = tc.Function.Name
				}
				a.arguments.WriteString(tc.Function.Arguments)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("reading stream: %w", err)
	}

	result := &StreamResult{}
	for i := 0; i < len(accum); i++ {
		a, ok := accum[i]
		if !ok {
			continue
		}
		result.ToolCalls = append(result.ToolCalls, ToolCall{
			ID:   a.id,
			Type: a.tcType,
			Function: ToolCallFunction{
				Name:      a.name,
				Arguments: a.arguments.String(),
			},
		})
	}
	return result, nil
}
