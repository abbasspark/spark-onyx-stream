// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { categoriesApi } from '@/api/endpoints';
import type { Category } from '@/api/types';
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
import { Field, Input, Textarea } from '@/components/ui/form';
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
  Tooltip,
} from '@/components/ui/overlay';

/** Categories that viewers browse by, such as genres, in the order they are shown. */
export function CategoriesPage() {
  const { can } = useSession();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mayWrite = can('catalog:write');
  // null: closed, 'new': empty form, a category: editing it.
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => categoriesApi.list(signal),
  });
  const items = categories.data ?? [];
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    void queryClient.invalidateQueries({ queryKey: ['titles'] });
  };
  const onError = (error: Error) => toast.error(error.message);

  const reorder = useMutation({
    mutationFn: categoriesApi.reorder,
    // The new order is shown at once and corrected if the server refuses it.
    onMutate: (ids: string[]) => {
      const previous = queryClient.getQueryData<Category[]>(['categories']);
      queryClient.setQueryData<Category[]>(['categories'], (current) =>
        current ? ids.map((id) => current.find((item) => item.id === id) as Category) : current,
      );
      return { previous };
    },
    onError: (error: Error, _ids, context) => {
      queryClient.setQueryData(['categories'], context?.previous);
      onError(error);
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (category: Category) => categoriesApi.remove(category.id),
    onSuccess: () => {
      toast.success('Category deleted');
      refresh();
    },
    onError,
  });

  const move = (index: number, step: -1 | 1) => {
    const ids = items.map((item) => item.id);
    const target = index + step;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    reorder.mutate(ids);
  };

  const askDelete = async (category: Category) => {
    const confirmed = await confirm({
      title: `Delete the category "${category.name}"?`,
      description:
        category.titleCount > 0
          ? `${category.titleCount} ${category.titleCount === 1 ? 'title loses' : 'titles lose'} this category. The titles themselves stay.`
          : 'No title uses it.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(category);
    }
  };

  return (
    <>
      <PageHeader
        title="Categories"
        description="Groups that viewers browse by, such as genres. They are shown in this order."
        actions={
          mayWrite ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus />
              New category
            </Button>
          ) : null
        }
      />

      <ErrorNote error={categories.error} className="mb-4" />
      {categories.isPending ? <Skeleton className="h-64 rounded-xl" /> : null}
      {categories.data && items.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No categories yet"
          action={
            mayWrite ? (
              <Button variant="primary" onClick={() => setEditing('new')}>
                <Plus />
                New category
              </Button>
            ) : null
          }
        >
          Create categories such as Drama or Documentary, then choose them on your titles.
        </EmptyState>
      ) : null}

      {items.length > 0 ? (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                {mayWrite ? <Th className="w-24">Order</Th> : null}
                <Th>Name</Th>
                <Th>Description</Th>
                <Th>Titles</Th>
                <Th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((category, index) => (
                <Tr key={category.id}>
                  {mayWrite ? (
                    <Td>
                      <div className="flex gap-1">
                        <Tooltip content="Move up">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={index === 0 || reorder.isPending}
                            aria-label={`Move ${category.name} up`}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Move down">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={index === items.length - 1 || reorder.isPending}
                            aria-label={`Move ${category.name} down`}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown />
                          </Button>
                        </Tooltip>
                      </div>
                    </Td>
                  ) : null}
                  <Td>
                    <p className="font-medium">{category.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{category.slug}</p>
                  </Td>
                  <Td className="max-w-md text-muted-foreground">{category.description ?? '–'}</Td>
                  <Td className="tabular-nums">
                    {category.titleCount > 0 ? (
                      <Link
                        to={`/movies?category=${category.id}`}
                        className="text-primary hover:underline"
                      >
                        {category.titleCount}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </Td>
                  <Td>
                    {mayWrite ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${category.name}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(category)}>
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => void askDelete(category)}>
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

      <CategoryDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(category) => {
          toast.success(`Category "${category.name}" saved`);
          setEditing(null);
          refresh();
        }}
      />
    </>
  );
}

interface CategoryDialogProps {
  target: Category | 'new' | null;
  onClose: () => void;
  onSaved: (category: Category) => void;
}

function CategoryDialog({ target, onClose, onSaved }: CategoryDialogProps) {
  const category = target === 'new' || target === null ? undefined : target;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');

  const save = useMutation({
    mutationFn: () =>
      category
        ? categoriesApi.update(category.id, { name: name.trim(), slug: slug.trim(), description })
        : categoriesApi.create({ name: name.trim(), description }),
    onSuccess: onSaved,
  });

  useEffect(() => {
    if (target !== null) {
      save.reset();
      setName(category?.name ?? '');
      setSlug(category?.slug ?? '');
      setDescription(category?.description ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={category ? `Edit ${category.name}` : 'New category'}>
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  maxLength={80}
                  placeholder="Drama"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            {category ? (
              <Field
                label="Slug"
                hint="Part of the web address. Changing it breaks links that people saved."
              >
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={80}
                    className="font-mono"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                  />
                )}
              </Field>
            ) : null}
            <Field label="Description" hint="Optional. Shown to viewers on the category page.">
              {(id) => (
                <Textarea
                  id={id}
                  maxLength={500}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              )}
            </Field>
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={!name.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
