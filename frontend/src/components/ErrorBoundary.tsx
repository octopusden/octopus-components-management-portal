import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last-resort React error boundary wrapping the whole app, OUTSIDE the data router.
 * The route-level <RouteError/> only catches errors thrown by page routes; an error in
 * the AppShell layout itself (hotkeys, command palette, toaster) or in a top-level
 * provider would still unmount the tree to a blank page. This class boundary renders a
 * minimal recovery surface for those cases. It uses inline styles (no Tailwind classes,
 * no router context) so the fallback still renders even if styling or routing is the
 * thing that broke.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught application error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
        style={{
          maxWidth: '32rem',
          margin: '0 auto',
          padding: '4rem 1.5rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Something went wrong
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', wordBreak: 'break-word', marginBottom: '1.5rem' }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => window.location.reload()}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5e1',
            background: '#1a1d23',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}
