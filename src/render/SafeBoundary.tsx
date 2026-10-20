// Keeps the game running if a decorative asset fails to load (falls back to procedural art).
import { Component, type ReactNode } from 'react';

export class SafeBoundary extends Component<{ fallback?: ReactNode; children: ReactNode; name?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn(`[assets] ${this.props.name ?? 'model'} failed, using fallback:`, (err as Error)?.message ?? err);
  }
  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children;
  }
}
