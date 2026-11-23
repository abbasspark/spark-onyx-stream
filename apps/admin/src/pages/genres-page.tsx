// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Shapes, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { genresApi } from '@/api/endpoints';
import type { Genre } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import {
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';

/** What kinds of story the catalog holds, and how many titles of each. */
export function GenresPage() {
  const { can } = useSession();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mayWrite = can('catalog:write');
  // null: closed, 'new': empty form, a genre: editing it.
  const [editing, setEditing] = useState<Genre | 'new' | null>(null);

  const genres = useQuery({
    queryKey: ['genres'],
    queryFn: ({ signal }) => genresApi.list(signal),
  });
  const items = genres.data ?? [];
  const most = Math.max(1, ...items.map((genre) => genre.titleCount));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['genres'] });
    void queryClient.invalidateQueries({ queryKey: ['titles'] });
  };

  const remove = useMutation({
    mutationFn: (genre: Genre) => genresApi.remove(genre.id),
    onSuccess: () => {
      toast.success('Genre deleted');
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const askDelete = async (genre: Genre) => {
    const confirmed = await confirm({
      title: `Delete the genre "${genre.name}"?`,
      description:
        genre.titleCount > 0
          ? `${genre.titleCount} ${genre.titleCount === 1 ? 'title loses' : 'titles lose'} this genre. The titles themselves stay. The next import of such a title creates the genre again.`
          : 'No title has it.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(genre);
    }
  };

  const newButton = mayWrite ? (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus />
      New genre
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Genres"
        description="What kind of story a title is. Genres come with an import and are shared by all titles. Shelves of your own making are categories."
        actions={newButton}
      />

      <ErrorNote error={genres.error} className="mb-4" />
      {genres.isPending ? <Skeleton className="h-64 rounded-xl" /> : null}
      {genres.data && items.length === 0 ? (
        <EmptyState icon={Shapes} title="No genres yet" action={newButton}>
          Genres are created when you import a title from TMDB. You can also add your own.
        </EmptyState>
      ) : null}

      {items.length > 0 ? (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="w-1/2">Titles</Th>
                <Th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((genre) => (
                <Tr key={genre.id}>
                  <Td>
                    <p className="font-medium">{genre.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{genre.slug}</p>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="w-8 shrink-0 text-right tabular-nums">
                        {genre.titleCount}
                      </span>
                      <span className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-muted sm:block">
                        <span
                          className="block h-full rounded-full bg-primary/70"
                          style={{ width: `${(genre.titleCount / most) * 100}%` }}
                        />
                      </span>
                      {genre.titleCount > 0 ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          <Link
                            to={`/movies?genre=${genre.id}`}
                            className="underline underline-offset-4 hover:text-foreground"
                          >
                            Movies
                          </Link>
                          {' · '}
                          <Link
                            to={`/series?genre=${genre.id}`}
                            className="underline underline-offset-4 hover:text-foreground"
                          >
                            Series
                          </Link>
                        </span>
                      ) : null}
                    </div>
                  </Td>
                  <Td>
                    {mayWrite ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${genre.name}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(genre)}>
                            <Pencil />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => void askDelete(genre)}>
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <GenreDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(genre) => {
          toast.success(`Genre "${genre.name}" saved`);
          setEditing(null);
          refresh();
        }}
      />
    </>
  );
}

interface GenreDialogProps {
  target: Genre | 'new' | null;
  onClose: () => void;
  onSaved: (genre: Genre) => void;
}

function GenreDialog({ target, onClose, onSaved }: GenreDialogProps) {
  const genre = target === 'new' || target === null ? undefined : target;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const save = useMutation({
    mutationFn: () =>
      genre
        ? genresApi.update(genre.id, { name: name.trim(), slug: slug.trim() })
        : genresApi.create({ name: name.trim() }),
    onSuccess: onSaved,
  });

  useEffect(() => {
    if (target !== null) {
      save.reset();
      setName(genre?.name ?? '');
      setSlug(genre?.slug ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={genre ? `Rename "${genre.name}"` : 'New genre'} size="sm">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  maxLength={60}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            {genre ? (
              <Field label="Slug" hint="The readable part of its web address.">
                {(id) => (
                  <Input
                    id={id}
                    required
                    className="font-mono"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                  />
                )}
              </Field>
            ) : null}
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
