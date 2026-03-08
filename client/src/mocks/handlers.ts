import { http, HttpResponse } from 'msw'

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

interface DemoProject {
  id: string
  name: string
  repoURL: string
  createdAt: string
}

let demoProjects: DemoProject[] = [
  {
    id: 'demo-web',
    name: 'demo-web',
    repoURL: 'https://github.com/demo/demo-web',
    createdAt: '2024-01-10T10:00:00Z',
  },
  {
    id: 'demo-api',
    name: 'demo-api',
    repoURL: 'https://github.com/demo/demo-api',
    createdAt: '2024-01-08T14:30:00Z',
  },
]

const demoGithubRepos = [
  {
    id: 1,
    fullName: 'demo/demo-web',
    description: 'Demo web application',
    language: 'TypeScript',
    updatedAt: '2024-01-10T10:00:00Z',
    htmlURL: 'https://github.com/demo/demo-web',
  },
  {
    id: 2,
    fullName: 'demo/demo-api',
    description: 'Demo backend API',
    language: 'Go',
    updatedAt: '2024-01-08T14:30:00Z',
    htmlURL: 'https://github.com/demo/demo-api',
  },
  {
    id: 3,
    fullName: 'demo/frontend',
    description: 'Frontend application',
    language: 'TypeScript',
    updatedAt: '2024-01-05T09:00:00Z',
    htmlURL: 'https://github.com/demo/frontend',
  },
  {
    id: 4,
    fullName: 'demo/infra',
    description: 'Infrastructure as code',
    language: 'HCL',
    updatedAt: '2024-01-03T16:45:00Z',
    htmlURL: 'https://github.com/demo/infra',
  },
]

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers = [
  http.get('/api/whoami', () => {
    return HttpResponse.json({ login: 'demo', id: 0 })
  }),

  http.get('/api/projects', () => {
    return HttpResponse.json(demoProjects)
  }),

  http.post('/api/projects', async ({ request }) => {
    const body = (await request.json()) as { repoURL: string }
    const name = body.repoURL.split('/').pop() ?? 'project'
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const project: DemoProject = {
      id,
      name,
      repoURL: body.repoURL,
      createdAt: new Date().toISOString(),
    }
    demoProjects = [...demoProjects, project]
    return HttpResponse.json(project, { status: 201 })
  }),

  http.get('/api/github/repos', () => {
    return HttpResponse.json(demoGithubRepos)
  }),
]
