import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Top-level error boundary: a render error anywhere below shows a plain, in-flow message with a
 * reload button instead of a blank page. Color tokens only (see theme.css).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[gallagioloot] Render error', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="app-shell">
        <main className="app-main app-main--page">
          <section className="panel" role="alert">
            <h3>Something went wrong</h3>
            <p className="warning-banner">GallagioLoot hit an unexpected error and stopped rendering. Your saved data is untouched.</p>
            <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </section>
        </main>
      </div>
    )
  }
}
