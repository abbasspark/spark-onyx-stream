// SPDX-License-Identifier: AGPL-3.0-only
import { Check, Copy } from 'lucide-react';
import { Fragment, type ReactNode, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { Button } from './ui/button';

/** A string with its quotes, a number, a word (true, false, null), or anything else. */
const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

/** JSON split into coloured parts: names, text, numbers and words read apart at a glance. */
function paint(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [whole, quoted, colon, number, word] = match;
    const at = match.index;
    if (at > last) {
      parts.push(text.slice(last, at));
    }
    if (quoted && colon) {
      parts.push(
        <Fragment key={at}>
          <span className="text-primary">{quoted}</span>
          {colon}
        </Fragment>,
      );
    } else if (quoted) {
      parts.push(
        <span key={at} className="text-foreground">
          {quoted}
        </span>,
      );
    } else {
      parts.push(
        <span key={at} className="text-info">
          {number ?? word}
        </span>,
      );
    }
    last = at + whole.length;
  }
  parts.push(text.slice(last));
  return parts;
}

interface JsonViewProps {
  value: unknown;
  /** Says what this is, for the copy button and for screen readers. */
  label: string;
  className?: string;
}

/** A value written out as JSON, to read and to copy. */
export function JsonView({ value, label, className }: JsonViewProps) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const painted = useMemo(() => paint(text), [text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Copying is blocked by the browser. Select the text and copy it by hand.');
    }
  };

  return (
    <div className={cn('relative min-w-0', className)}>
      <pre
        className="max-h-96 overflow-auto rounded-md border bg-muted p-3 pr-12 font-mono text-xs leading-relaxed text-muted-foreground"
        aria-label={label}
        tabIndex={0}
      >
        {painted}
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
  );
}
