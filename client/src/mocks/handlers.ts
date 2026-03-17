import { http, HttpResponse } from 'msw'

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
    return HttpResponse.json(project, { status: 201 })
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
]
