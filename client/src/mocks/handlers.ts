import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/whoami', () => {
    return HttpResponse.json({ login: 'demo', id: 0 })
  }),
]
