/**
 * FileTree — collapsible file-system tree loaded lazily one directory at a
 * time from GET /api/projects/:pid/workspaces/:wid/files?path=<dir>.
 */

import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DirEntry {
  name: string
  type: 'file' | 'dir'
  size: number
  modTime: string
}

interface FileTreeProps {
  pid: string
  wid: string
  /** Called when the user clicks a file entry. */
  onFileSelect: (path: string) => void
  /** The currently-selected file path (highlighted in the tree). */
  selectedPath?: string
}

// ---------------------------------------------------------------------------
// Colour tokens (match existing pages)
// ---------------------------------------------------------------------------

const C = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceHover: '#263348',
  selected: '#1e3a5f',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  blueLight: '#93c5fd',
}

// ---------------------------------------------------------------------------
// TreeNode — renders a single entry and, for directories, its children
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  pid: string
  wid: string
  /** Path of this entry relative to the workspace root (no leading slash). */
  path: string
  name: string
  type: 'file' | 'dir'
  depth: number
  onFileSelect: (path: string) => void
  selectedPath?: string
}

function TreeNode({ pid, wid, path, name, type, depth, onFileSelect, selectedPath }: TreeNodeProps) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<DirEntry[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const isSelected = type === 'file' && path === selectedPath

  async function toggleDir() {
    if (type !== 'dir') return
    const next = !open
    setOpen(next)
    if (next && children === null) {
      try {
        const r = await fetch(`/api/projects/${pid}/workspaces/${wid}/files?path=${encodeURIComponent(path)}`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        setChildren(await r.json() as DirEntry[])
      } catch (err) {
        setLoadErr(String(err))
      }
    }
  }

  function handleClick() {
    if (type === 'dir') {
      toggleDir()
    } else {
      onFileSelect(path)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  const indent = depth * 14

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: `0.25rem 0.5rem 0.25rem ${indent + 8}px`,
    cursor: 'pointer',
    background: isSelected ? C.selected : 'transparent',
    color: isSelected ? C.blueLight : C.text,
    fontSize: '0.8125rem',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    borderRadius: '0.25rem',
  }

  const icon = type === 'dir' ? (open ? '▾' : '▸') : '·'
  const iconColor = type === 'dir' ? C.blueLight : C.muted

  return (
    <div>
      <div
        style={rowStyle}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`${type === 'dir' ? (open ? 'Collapse' : 'Expand') : 'Open'} ${name}`}
        aria-expanded={type === 'dir' ? open : undefined}
      >
        <span style={{ color: iconColor, flexShrink: 0, fontSize: '0.625rem' }}>{icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      </div>

      {type === 'dir' && open && (
        <div>
          {loadErr && (
            <div style={{ paddingLeft: indent + 24, fontSize: '0.75rem', color: '#f87171' }}>
              {loadErr}
            </div>
          )}
          {children === null && !loadErr && (
            <div style={{ paddingLeft: indent + 24, fontSize: '0.75rem', color: C.muted }}>
              Loading…
            </div>
          )}
          {children?.map(child => (
            <TreeNode
              key={child.name}
              pid={pid}
              wid={wid}
              path={path ? `${path}/${child.name}` : child.name}
              name={child.name}
              type={child.type}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FileTree — loads workspace root on mount and renders TreeNode list
// ---------------------------------------------------------------------------

export default function FileTree({ pid, wid, onFileSelect, selectedPath }: FileTreeProps) {
  const [rootEntries, setRootEntries] = useState<DirEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/projects/${pid}/workspaces/${wid}/files`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DirEntry[]>
      })
      .then(entries => { setRootEntries(entries); setLoading(false) })
      .catch(err => { setError(String(err)); setLoading(false) })
  }, [pid, wid])

  const containerStyle: React.CSSProperties = {
    background: C.bg,
    color: C.text,
    height: '100%',
    overflowY: 'auto',
    padding: '0.5rem 0.25rem',
    boxSizing: 'border-box',
  }

  if (loading) {
    return (
      <div style={{ ...containerStyle, padding: '1rem', color: C.muted, fontSize: '0.8125rem' }}>
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...containerStyle, padding: '1rem', color: '#f87171', fontSize: '0.8125rem' }}>
        {error}
      </div>
    )
  }

  if (!rootEntries || rootEntries.length === 0) {
    return (
      <div style={{ ...containerStyle, padding: '1rem', color: C.muted, fontSize: '0.8125rem' }}>
        Empty workspace
      </div>
    )
  }

  return (
    <div style={containerStyle} role="tree" aria-label="Workspace file tree">
      {rootEntries.map(entry => (
        <TreeNode
          key={entry.name}
          pid={pid}
          wid={wid}
          path={entry.name}
          name={entry.name}
          type={entry.type}
          depth={0}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  )
}
