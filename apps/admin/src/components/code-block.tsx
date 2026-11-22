// SPDX-License-Identifier: AGPL-3.0-only
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';

/** Several lines to carry to a terminal, with a button that copies them. */
export function CodeBlock({ label, code, note }: { label: string; code: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Copying is blocked by the browser. Select the text and copy it by hand.');
    }
  };
  return (
    <div className="grid min-w-0 gap-2">
      <div className="relative min-w-0">
        <pre
          className="overflow-x-auto rounded-md border bg-muted p-3 pr-12 font-mono text-xs leading-relaxed"
          aria-label={label}
        >
          {code}
        </pre>
        <Button
          size="icon-sm"
          variant="ghost"
          className="absolute top-1.5 right-1.5"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => void copy()}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
