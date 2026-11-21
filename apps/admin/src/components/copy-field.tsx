// SPDX-License-Identifier: AGPL-3.0-only
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';

interface CopyFieldProps {
  label: string;
  value: string;
  /** Shown as dots until the admin asks to see it. Copying works either way. */
  secret?: boolean;
  hint?: string;
}

/** A value to carry to another program: shown in full, with a button that copies it. */
export function CopyField({ label, value, secret = false, hint }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);
  const hidden = secret && !shown;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Copying is blocked by the browser. Select the text and copy it by hand.');
    }
  };

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <code
          className={
            hidden
              ? 'min-w-0 flex-1 truncate rounded-md border bg-muted px-2.5 py-1.5 font-mono text-xs tracking-widest text-muted-foreground select-none'
              : 'min-w-0 flex-1 rounded-md border bg-muted px-2.5 py-1.5 font-mono text-xs break-all select-all'
          }
        >
          {hidden ? '•'.repeat(24) : value}
        </code>
        {secret ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={shown ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={shown}
            onClick={() => setShown(!shown)}
          >
            {shown ? <EyeOff /> : <Eye />}
          </Button>
        ) : null}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Copy ${label}`}
          onClick={() => void copy()}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
