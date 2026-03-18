/**
 * FileViewer — fetches and displays the raw contents of a workspace file,
 * with client-side syntax highlighting via highlight.js.
 */

import { useEffect, useRef, useState } from 'react'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

// ---------------------------------------------------------------------------
// Colour tokens
// ---------------------------------------------------------------------------

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blueLight: '#93c5fd',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FileViewerProps {
  pid: string
  wid: string
  /** Path of the file relative to the workspace root. */
  path: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FileViewer({ pid, wid, path }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!path) return
    setLoading(true)
    setContent(null)
    setError(null)

    fetch(`/api/projects/${pid}/workspaces/${wid}/file?path=${encodeURIComponent(path)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then(text => { setContent(text); setLoading(false) })
      .catch(err => { setError(String(err)); setLoading(false) })
  }, [pid, wid, path])

  // Apply syntax highlighting after content renders.
  useEffect(() => {
    if (codeRef.current && content !== null) {
      // Remove any previously-applied highlight to allow re-highlighting.
      delete codeRef.current.dataset.highlighted
      hljs.highlightElement(codeRef.current)
    }
  }, [content])

  const containerStyle: React.CSSProperties = {
    background: C.bg,
    color: C.text,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  const headerStyle: React.CSSProperties = {
    padding: '0.375rem 1rem',
    background: C.surface,
    borderBottom: `1px solid ${C.border}`,
    fontSize: '0.8125rem',
    color: C.blueLight,
    fontFamily: 'monospace',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  const scrollAreaStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'auto',
  }

  const preStyle: React.CSSProperties = {
    margin: 0,
    padding: '1rem',
    fontSize: '0.8125rem',
    lineHeight: 1.6,
    fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
    background: 'transparent',
    whiteSpace: 'pre',
    minHeight: '100%',
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle} title={path}>{path}</div>
      <div style={scrollAreaStyle}>
        {loading && (
          <div style={{ padding: '1rem', color: C.muted, fontSize: '0.8125rem' }}>Loading…</div>
        )}
        {error && (
          <div style={{ padding: '1rem', color: '#f87171', fontSize: '0.8125rem' }}>{error}</div>
        )}
        {!loading && !error && content !== null && (
          <pre style={preStyle}>
            <code ref={codeRef}>{content}</code>
          </pre>
        )}
      </div>
    </div>
  )
}
