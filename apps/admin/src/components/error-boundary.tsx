// SPDX-License-Identifier: AGPL-3.0-only
import { Bug } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button';
import { EmptyState } from './ui/display';

interface Props {
  /** Changing this value clears the error, for example when the admin goes to another page. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  resetKey: string;
}

/**
 * Catches an error while a page is drawn and shows a message in its place,
 * so one broken page does not blank the whole panel.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('A page failed to render', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <EmptyState
        icon={Bug}
        title="This page ran into a problem"
        action={<Button onClick={() => window.location.reload()}>Reload the page</Button>}
      >
        {this.state.error.message}
      </EmptyState>
    );
  }
}
