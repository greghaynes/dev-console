.PHONY: build test dev clean lint vet

# Build the server binary.
build:
	go build -o bin/dev-console ./cmd/dev-console

# Run all tests.
test:
	go test ./...

# Run tests with verbose output and race detector.
test-race:
	go test -race -v ./...

# Start the server in development mode using the example config.
# Requires that dev-console.yaml exists; copy from dev-console.yaml.example.
dev: build
	./bin/dev-console --config dev-console.yaml

# Remove build artifacts.
clean:
	rm -rf bin/

# Run go vet.
vet:
	go vet ./...

# Run the linter (requires golangci-lint to be installed).
lint:
	golangci-lint run ./...
