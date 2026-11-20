// SPDX-License-Identifier: AGPL-3.0-only
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as tus from 'tus-js-client';
import { API_ORIGIN } from '../api/client';
import { assetsApi } from '../api/endpoints';
import type { CreateAssetInput } from '../api/types';
import { formatBytes } from '../lib/format';
import { tokenStore } from '../auth/token-store';

/** Files are sent in parts of this size, so a broken connection loses at most one part. */
const CHUNK_BYTES = 8 * 1024 * 1024;

export interface UploadItem {
  /** Local id of the upload, not the asset id. */
  id: string;
  title: string;
  fileName: string;
  totalBytes: number;
  sentBytes: number;
  status: 'starting' | 'uploading' | 'done' | 'failed' | 'cancelled';
  assetId: string | null;
  error: string | null;
}

interface UploadsContextValue {
  uploads: readonly UploadItem[];
  /** Creates the asset and sends the file. The upload continues while the admin moves around the panel. */
  start: (file: File, options: CreateAssetInput) => void;
  cancel: (id: string) => void;
  /** Removes finished, failed and cancelled uploads from the list. */
  clearFinished: () => void;
}

const UploadsContext = createContext<UploadsContextValue | null>(null);

export function UploadsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const running = useRef(new Map<string, tus.Upload>());

  const update = useCallback((id: string, change: Partial<UploadItem>) => {
    setUploads((items) => items.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }, []);

  const start = useCallback(
    (file: File, options: CreateAssetInput) => {
      const id = crypto.randomUUID();
      setUploads((items) => [
        {
          id,
          title: options.title,
          fileName: file.name,
          totalBytes: file.size,
          sentBytes: 0,
          status: 'starting',
          assetId: null,
          error: null,
        },
        ...items,
      ]);

      void (async () => {
        try {
          const created = await assetsApi.create(options);
          update(id, { assetId: created.asset.id });
          void queryClient.invalidateQueries({ queryKey: ['assets'] });

          if (file.size > created.upload.maxBytes) {
            throw new Error(
              `The file is larger than this server's limit of ${formatBytes(created.upload.maxBytes)}`,
            );
          }

          const upload = new tus.Upload(file, {
            endpoint: `${API_ORIGIN}${created.upload.endpoint}`,
            chunkSize: CHUNK_BYTES,
            retryDelays: [0, 1000, 3000, 5000, 10_000],
            metadata: { ...created.upload.metadata, filename: file.name },
            // Each upload belongs to a new asset, so an earlier upload is never continued.
            storeFingerprintForResuming: false,
            // Read for every request, so a long upload survives signing in again.
            onBeforeRequest: (request) => {
              const token = tokenStore.read();
              if (token) {
                request.setHeader('Authorization', `Bearer ${token}`);
              }
            },
            onProgress: (sentBytes) => update(id, { status: 'uploading', sentBytes }),
            onSuccess: () => {
              running.current.delete(id);
              update(id, { status: 'done', sentBytes: file.size });
              void queryClient.invalidateQueries({ queryKey: ['assets'] });
              void queryClient.invalidateQueries({ queryKey: ['jobs'] });
            },
            onError: (error) => {
              running.current.delete(id);
              update(id, { status: 'failed', error: error.message });
            },
          });
          running.current.set(id, upload);
          update(id, { status: 'uploading' });
          upload.start();
        } catch (error) {
          update(id, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'The upload could not be started',
          });
        }
      })();
    },
    [queryClient, update],
  );

  const cancel = useCallback(
    (id: string) => {
      const upload = running.current.get(id);
      running.current.delete(id);
      // Also tells the server to drop the part it already has.
      void upload?.abort(true).catch(() => undefined);
      update(id, { status: 'cancelled' });
    },
    [update],
  );

  const clearFinished = useCallback(() => {
    setUploads((items) =>
      items.filter((item) => item.status === 'starting' || item.status === 'uploading'),
    );
  }, []);

  // Leaving the page would end running uploads, so the browser asks first.
  const active = uploads.some((item) => item.status === 'starting' || item.status === 'uploading');
  useEffect(() => {
    if (!active) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);

  const value = useMemo(
    () => ({ uploads, start, cancel, clearFinished }),
    [uploads, start, cancel, clearFinished],
  );
  return <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>;
}

export function useUploads(): UploadsContextValue {
  const context = useContext(UploadsContext);
  if (!context) {
    throw new Error('useUploads must be used inside UploadsProvider');
  }
  return context;
}
