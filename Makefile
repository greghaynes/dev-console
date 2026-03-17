.PHONY: build client-build test test-race dev clean lint vet site-build site-build-with-demo site-serve

# Build the client SPA (production build for embedding in the server binary).
client-build:
	cd client && npm ci && npm run build

# Build the server binary.
# Copies the compiled SPA into internal/spa/dist/ so that go:embed picks it up.
build: client-build
	cp -r client/dist/. internal/spa/dist/
	go build -o bin/dev-console ./cmd/dev-console

# Run all tests.
test:
	go test ./...

# Run tests with verbose output and race detector.
test-race:
	go test -race -v ./...

# Start the server in development mode using the example config.
# Requires that dev-console.yaml exists; copy from docs/examples/dev-console.yaml.example.
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

# Build the documentation site (requires Hugo extended).
# Outputs to site/public/.
site-build:
	cd site && hugo --minify

# Build the documentation site together with the frontend demo (if client/ exists).
# This is the Cloudflare Workers build command (used in wrangler.toml).
# Requires Node.js 22+ in the environment running this build (local machine or CI; e.g., set NODE_VERSION=22 in your CI/job env).
site-build-with-demo:
	@if [ -d "client" ] && [ -f "client/package.json" ]; then \
		set -e; \
		cd client && npm ci && VITE_DEMO_MODE=true npm run build -- --base /demo/ && \
		mkdir -p ../site/static/demo && cp -r dist/. ../site/static/demo/; \
	fi
	cd site && hugo --minify

# Serve the documentation site locally with live reload.
site-serve:
	cd site && hugo server

