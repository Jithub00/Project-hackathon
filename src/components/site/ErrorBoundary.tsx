import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface State {
  error: Error | null;
}

/** Catches rendering errors so a single broken panel never blanks the whole site. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[photo-shoot] render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-start justify-center gap-5 px-6 py-20">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="text-4xl font-black uppercase tracking-tight md:text-5xl">This page hit a snag.</h1>
        <p className="text-muted-foreground">
          Your work has not been lost. Reload the page to continue. If it keeps happening, contact the Photo Shoot team.
        </p>
        <Button onClick={() => window.location.reload()}>Reload page</Button>
      </div>
    );
  }
}
