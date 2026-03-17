import { http, HttpResponse, ws } from 'msw'
import type { WebSocketHandlerConnection } from 'msw'

// ---------------------------------------------------------------------------
// In-memory demo state
// ---------------------------------------------------------------------------

// Mutable in-handler store so POST /api/projects can append entries.
const projects: Array<{ id: string; name: string; repoURL: string; createdAt: string }> = [
  {
    id: 'demo-web',
    name: 'demo-web',
    repoURL: 'https://github.com/demo/demo-web',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'demo-api',
    name: 'demo-api',
    repoURL: 'https://github.com/demo/demo-api',
    createdAt: '2024-01-02T00:00:00Z',
  },
]

// Per-project workspace lists.  Pre-seeded with one workspace each.
const workspaces: Record<string, Array<{ id: string; projectId: string; name: string; branch: string; prNumber: null; createdAt: string }>> = {
  'demo-web': [
    { id: 'main', projectId: 'demo-web', name: 'main', branch: 'main', prNumber: null, createdAt: '2024-01-01T00:00:00Z' },
  ],
  'demo-api': [
    { id: 'main', projectId: 'demo-api', name: 'main', branch: 'main', prNumber: null, createdAt: '2024-01-02T00:00:00Z' },
  ],
}

// ---------------------------------------------------------------------------
// Demo file system fixture
// ---------------------------------------------------------------------------

// A small hard-coded directory tree used by the file API demo handlers.
type DemoEntry = { name: string; type: 'file' | 'dir'; size: number; modTime: string }

const demoFiles: Record<string, DemoEntry[]> = {
  '': [
    { name: 'README.md', type: 'file', size: 512, modTime: '2024-01-01T00:00:00Z' },
    { name: 'src', type: 'dir', size: 0, modTime: '2024-01-01T00:00:00Z' },
    { name: 'package.json', type: 'file', size: 256, modTime: '2024-01-01T00:00:00Z' },
  ],
  'src': [
    { name: 'main.ts', type: 'file', size: 1024, modTime: '2024-01-01T00:00:00Z' },
    { name: 'utils.ts', type: 'file', size: 512, modTime: '2024-01-01T00:00:00Z' },
    { name: 'components', type: 'dir', size: 0, modTime: '2024-01-01T00:00:00Z' },
  ],
  'src/components': [
    { name: 'App.tsx', type: 'file', size: 2048, modTime: '2024-01-01T00:00:00Z' },
    { name: 'Button.tsx', type: 'file', size: 768, modTime: '2024-01-01T00:00:00Z' },
  ],
}

const demoFileContents: Record<string, string> = {
  'README.md': `# Demo Project\n\nThis is a demo workspace for Dev Console.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n`,
  'package.json': `{\n  "name": "demo-project",\n  "version": "1.0.0",\n  "scripts": {\n    "start": "ts-node src/main.ts",\n    "build": "tsc"\n  },\n  "dependencies": {\n    "typescript": "^5.0.0"\n  }\n}\n`,
  'src/main.ts': `import { greet } from './utils'\n\nconst name = process.env.NAME ?? 'world'\nconsole.log(greet(name))\n`,
  'src/utils.ts': `/**\n * Returns a greeting message for the given name.\n */\nexport function greet(name: string): string {\n  return \`Hello, \${name}!\`\n}\n`,
  'src/components/App.tsx': `import React from 'react'\nimport { Button } from './Button'\n\nexport function App() {\n  return (\n    <div className="app">\n      <h1>Demo App</h1>\n      <Button label="Click me" onClick={() => alert('Hello!')} />\n    </div>\n  )\n}\n`,
  'src/components/Button.tsx': `import React from 'react'\n\ninterface ButtonProps {\n  label: string\n  onClick: () => void\n}\n\nexport function Button({ label, onClick }: ButtonProps) {\n  return <button onClick={onClick}>{label}</button>\n}\n`,
}

// ---------------------------------------------------------------------------
// WebSocket terminal handler (covers both ws:// and wss://)
// ---------------------------------------------------------------------------

const WS_TERMINAL_PATH = '/api/projects/:pid/workspaces/:wid/terminals/:tid'

function handleTerminalConnection({ client }: WebSocketHandlerConnection) {
  const welcome = '\x1b[1;34mWelcome to the Dev Console demo terminal!\x1b[0m\r\n$ '
  // Defer the welcome message by one tick so that the client's onmessage
  // handler is registered before MSW delivers the first server frame.
  setTimeout(() => client.send(welcome), 0)

  client.addEventListener('message', (event) => {
    const data = event.data
    // Ignore JSON resize control messages; echo everything else.
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data) as { type?: string }
        if (parsed.type === 'resize') return
      } catch {
        // not JSON — forward as raw text
      }
      client.send(data)
    } else if (data instanceof ArrayBuffer) {
      client.send(data)
    }
  })
}

/** Returns MSW WebSocket handlers for both ws:// and wss:// variants. */
function terminalWsHandlers() {
  return (['ws', 'wss'] as const).map(proto =>
    ws.link(`${proto}://*${WS_TERMINAL_PATH}`).addEventListener('connection', handleTerminalConnection)
  )
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers = [
  http.get('/api/whoami', () => {
    return HttpResponse.json({ login: 'demo', id: 0 })
  }),

  http.get('/api/projects', () => {
    return HttpResponse.json([...projects])
  }),

  http.post('/api/projects', async ({ request }) => {
    const body = (await request.json()) as { repoURL: string }
    const url = body.repoURL ?? ''
    const name = url.split('/').pop() ?? 'project'
    const id =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'project'
    const project = { id, name, repoURL: url, createdAt: new Date().toISOString() }
    projects.push(project)
    workspaces[id] = []
    return HttpResponse.json(project, { status: 201 })
  }),

  http.get('/api/projects/:pid', ({ params }) => {
    const pid = params.pid as string
    const project = projects.find(p => p.id === pid)
    if (!project) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(project)
  }),

  http.delete('/api/projects/:pid', ({ params }) => {
    const pid = params.pid as string
    const idx = projects.findIndex(p => p.id === pid)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    projects.splice(idx, 1)
    delete workspaces[pid]
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/projects/:pid/workspaces', ({ params }) => {
    const pid = params.pid as string
    return HttpResponse.json(workspaces[pid] ?? [])
  }),

  http.post('/api/projects/:pid/workspaces', async ({ params, request }) => {
    const pid = params.pid as string
    const body = (await request.json()) as { branch: string; name?: string }
    if (!body.branch) return new HttpResponse('branch is required', { status: 400 })
    const id = body.branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ws'
    const ws = {
      id,
      projectId: pid,
      name: body.name ?? body.branch,
      branch: body.branch,
      prNumber: null,
      createdAt: new Date().toISOString(),
    }
    if (!workspaces[pid]) workspaces[pid] = []
    workspaces[pid].push(ws)
    return HttpResponse.json(ws, { status: 201 })
  }),

  http.delete('/api/projects/:pid/workspaces/:wid', ({ params }) => {
    const { pid, wid } = params as { pid: string; wid: string }
    const list = workspaces[pid]
    if (!list) return new HttpResponse(null, { status: 404 })
    const idx = list.findIndex(w => w.id === wid)
    if (idx === -1) return new HttpResponse(null, { status: 404 })
    list.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/projects/:pid/workspaces/:wid/terminals', () => {
    return HttpResponse.json({ terminalId: 'demo-term' }, { status: 201 })
  }),

  // File API handlers (Phase 2.1).
  http.get('/api/projects/:pid/workspaces/:wid/files', ({ request }) => {
    const url = new URL(request.url)
    const path = url.searchParams.get('path') ?? ''
    const entries = demoFiles[path]
    if (entries === undefined) return new HttpResponse('path not found', { status: 404 })
    return HttpResponse.json(entries)
  }),

  http.get('/api/projects/:pid/workspaces/:wid/file', ({ request }) => {
    const url = new URL(request.url)
    const path = url.searchParams.get('path') ?? ''
    if (!path) return new HttpResponse('path query parameter is required', { status: 400 })
    const content = demoFileContents[path]
    if (content === undefined) return new HttpResponse('file not found', { status: 404 })
    return new HttpResponse(content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }),

  http.get('/api/github/repos', () => {
    return HttpResponse.json([
      {
        id: 1,
        fullName: 'demo/demo-web',
        description: 'Demo web application',
        language: 'TypeScript',
        updatedAt: '2024-01-01T00:00:00Z',
        htmlURL: 'https://github.com/demo/demo-web',
      },
      {
        id: 2,
        fullName: 'demo/demo-api',
        description: 'Demo API service',
        language: 'Go',
        updatedAt: '2024-01-02T00:00:00Z',
        htmlURL: 'https://github.com/demo/demo-api',
      },
      {
        id: 3,
        fullName: 'demo/demo-infra',
        description: 'Infrastructure as code',
        language: 'HCL',
        updatedAt: '2024-01-03T00:00:00Z',
        htmlURL: 'https://github.com/demo/demo-infra',
      },
      {
        id: 4,
        fullName: 'demo/demo-docs',
        description: 'Documentation site',
        language: 'Markdown',
        updatedAt: '2024-01-04T00:00:00Z',
        htmlURL: 'https://github.com/demo/demo-docs',
      },
    ])
  }),

  ...terminalWsHandlers(),
]
