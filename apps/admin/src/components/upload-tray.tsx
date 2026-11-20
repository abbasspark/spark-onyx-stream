// SPDX-License-Identifier: AGPL-3.0-only
import { CheckCircle2, ChevronDown, CircleAlert, CircleSlash, UploadCloud, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { type UploadItem, useUploads } from '@/uploads/uploads';
import { Button } from './ui/button';
import { Progress } from './ui/display';

const isActive = (item: UploadItem) => item.status === 'starting' || item.status === 'uploading';

/**
 * A floating panel in the corner that shows running uploads on every page,
 * so the admin can keep working while files are sent.
 */
export function UploadTray() {
  const { uploads, cancel, clearFinished } = useUploads();
  const [minimized, setMinimized] = useState(false);

  if (uploads.length === 0) {
    return null;
  }

  const active = uploads.filter(isActive);
  const total = active.reduce((sum, item) => sum + item.totalBytes, 0);
  const sent = active.reduce((sum, item) => sum + item.sentBytes, 0);
  const failed = uploads.filter((item) => item.status === 'failed').length;

  return (
    <section
      className="fixed right-4 bottom-4 z-40 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
      aria-label="Uploads"
    >
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <UploadCloud className="size-4 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {active.length > 0
              ? `Uploading ${active.length} ${active.length === 1 ? 'file' : 'files'}`
              : failed > 0
                ? `${failed} ${failed === 1 ? 'upload' : 'uploads'} failed`
                : 'Uploads finished'}
          </p>
          {active.length > 0 ? (
            <Progress
              value={total > 0 ? (sent / total) * 100 : 0}
              label="All uploads"
              className="mt-1"
            />
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMinimized((value) => !value)}
          aria-label={minimized ? 'Show the uploads' : 'Hide the uploads'}
          aria-expanded={!minimized}
        >
          <ChevronDown className={cn('transition-transform', minimized && 'rotate-180')} />
        </Button>
        {active.length === 0 ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearFinished}
            aria-label="Close the upload list"
          >
            <X />
          </Button>
        ) : null}
      </header>

      {minimized ? null : (
        <ul className="max-h-72 divide-y overflow-y-auto">
          {uploads.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              {item.status === 'done' ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : item.status === 'failed' ? (
                <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
              ) : item.status === 'cancelled' ? (
                <CircleSlash className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : (
                <UploadCloud className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                {item.assetId && item.status === 'done' ? (
                  <Link
                    to={`/assets/${item.assetId}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-medium">{item.title}</p>
                )}
                {isActive(item) ? (
                  <Progress
                    value={item.totalBytes > 0 ? (item.sentBytes / item.totalBytes) * 100 : 0}
                    label={`Upload of ${item.title}`}
                  />
                ) : (
                  <p className="truncate text-xs text-muted-foreground">
                    {item.status === 'done'
                      ? `${formatBytes(item.totalBytes)}, now processing`
                      : item.status === 'cancelled'
                        ? 'Cancelled'
                        : (item.error ?? 'Failed')}
                  </p>
                )}
              </div>
              {isActive(item) ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => cancel(item.id)}
                  aria-label={`Cancel the upload of ${item.title}`}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
