/**
 * Wireframes index page — links to all project-selection UI variants so they
 * can be viewed (and screenshotted) individually.
 */

import { Link } from 'react-router-dom'

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blue: '#2563eb',
}

const VARIANTS = [
  {
    path: '/wireframes/variant-a',
    label: 'Variant A',
    title: 'Classic Card List',
    desc: 'Full-width project cards with last-used timestamp and a chevron arrow. Faithful translation of the original ASCII wireframe. New-project dialog opens as a centred modal overlay.',
  },
  {
    path: '/wireframes/variant-b',
    label: 'Variant B',
    title: 'Grid Tiles + Slide-In Panel',
    desc: 'Responsive 2-column tile grid with language badges, activity indicators, and workspace-count chips. Clicking a tile opens a slide-in side panel showing its workspaces.',
  },
  {
    path: '/wireframes/variant-c',
    label: 'Variant C',
    title: 'Compact Table with Inline Expansion',
    desc: 'Data-dense table rows with a live search/filter input. Clicking a row expands it in-place to reveal its workspaces (accordion pattern). Best for power users with many projects.',
  },
  {
    path: '/wireframes/mobile-workspace',
    label: 'Mobile Workspace',
    title: 'Mobile Workspace — Tabbed Single-Panel',
    desc: 'Full-featured workspace on a 390 px phone frame. Bottom tab bar switches between Agent chat, Files, Changes, and Terminal. Replaces the desktop split-pane with full-screen panels. Agent sessions are integrated into the workspace view; a slide-in drawer handles workspace and session navigation.',
  },
]

export default function WireframesIndex() {
  const s: Record<string, React.CSSProperties> = {
    page: { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg },
    header: {
      padding: '0.75rem 1.5rem',
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      fontWeight: 700,
      fontSize: '1.125rem',
    },
    content: {
      flex: 1,
      padding: '2rem 1.5rem',
      maxWidth: '48rem',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box',
    },
    heading: { fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' },
    sub: { color: C.muted, fontSize: '0.9375rem', marginBottom: '2rem', lineHeight: 1.6 },
    card: {
      display: 'block',
      padding: '1.25rem 1.5rem',
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '0.625rem',
      marginBottom: '1rem',
      textDecoration: 'none',
      color: C.text,
    },
    badge: {
      display: 'inline-block',
      padding: '0.125rem 0.5rem',
      borderRadius: '0.25rem',
      background: '#1e3a5f',
      color: '#93c5fd',
      fontSize: '0.75rem',
      fontWeight: 600,
      marginBottom: '0.5rem',
    },
    cardTitle: { fontSize: '1rem', fontWeight: 700, marginBottom: '0.375rem' },
    cardDesc: { color: C.muted, fontSize: '0.875rem', lineHeight: 1.6 },
  }

  return (
    <div style={s.page}>
      <header style={s.header}>Dev Console — Wireframes</header>
      <main style={s.content}>
        <h1 style={s.heading}>Wireframe Variants</h1>
        <p style={s.sub}>
          Interactive wireframes for Dev Console. The first three variants cover
          the project-selection screen (Screens 2, 2a, and 2b). The fourth
          variant is the mobile workspace mockup — a full-feature phone-frame
          view with agent sessions, bottom tab navigation, and a slide-in
          drawer. Screenshots are taken at 1440 × 900 px (desktop) and
          375 × 812 px (mobile).
        </p>
        {VARIANTS.map(v => (
          <Link key={v.path} to={v.path} style={s.card}>
            <div style={s.badge}>{v.label}</div>
            <div style={s.cardTitle}>{v.title}</div>
            <p style={s.cardDesc}>{v.desc}</p>
          </Link>
        ))}
      </main>
    </div>
  )
}
