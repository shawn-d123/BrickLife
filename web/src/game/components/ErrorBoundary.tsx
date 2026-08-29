import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/**
 * A graceful ending beats a white screen at 17:32. If a scene throws mid-demo,
 * fall back to whatever the caller can still render.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: (reset: () => void) => ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("BrickLife crashed:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div className="err">
        <h2>Something broke</h2>
        <p className="quiet">{String(this.state.error.message)}</p>
        <button onClick={this.reset}>Try again</button>
      </div>
    );
  }
}
