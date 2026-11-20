// SPDX-License-Identifier: AGPL-3.0-only
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Button } from './ui/button';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  /** Text of the confirming button. */
  confirmLabel?: string;
  /** Marks an action that cannot be undone. */
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * Provides one confirmation dialog for the whole panel. Pages ask with
 * `await confirm({...})` and get true or false back.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    // A question still open is answered with "no" before the next one is shown.
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = (confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={options !== null} onOpenChange={(open) => !open && answer(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 animate-overlay bg-overlay backdrop-blur-[2px]" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-in gap-4 rounded-xl border bg-card p-6 shadow-2xl outline-none">
            <div className="grid gap-2">
              <AlertDialog.Title className="text-base font-semibold">
                {options?.title}
              </AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-muted-foreground">
                {options?.description ?? 'Please confirm.'}
              </AlertDialog.Description>
            </div>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button>Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant={options?.destructive ? 'destructive' : 'primary'}
                  onClick={() => answer(true)}
                >
                  {options?.confirmLabel ?? 'Confirm'}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used inside ConfirmProvider');
  }
  return confirm;
}
