// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, MonitorSmartphone, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { appVersionsApi } from '@/api/endpoints';
import type { AppVersionRule } from '@/api/types';
import { useSession } from '@/auth/session';
import { CodeBlock } from '@/components/code-block';
import { useConfirm } from '@/components/confirm';
import { JsonView } from '@/components/json-view';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter, Tooltip } from '@/components/ui/overlay';
import {
  appLabel,
  appOf,
  compareVersions,
  draftOf,
  draftProblem,
  EMPTY_RULE,
  KNOWN_APPS,
  OTHER_APP,
  refusalExample,
  type RuleDraft,
  ruleOf,
  STANDARD_MESSAGE,
  withRule,
} from '@/lib/app-versions';

const QUERY_KEY = ['app-versions'];

/** The oldest version of each app that may still connect. */
export function AppsPage() {
  const { can } = useSession();
  const mayWrite = can('settings:write');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  /** The rule in the form: one to change, "new" for a new one. */
  const [editing, setEditing] = useState<AppVersionRule | 'new' | null>(null);

  const versions = useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) => appVersionsApi.get(signal),
  });
  const save = useMutation({
    mutationFn: (rules: AppVersionRule[]) => appVersionsApi.save(rules),
    onSuccess: (saved) => {
      queryClient.setQueryData(QUERY_KEY, saved);
      setEditing(null);
    },
  });

  const rules = versions.data?.rules ?? [];
  const full = versions.data ? rules.length >= versions.data.maxRules : false;

  const askRemove = async (rule: AppVersionRule) => {
    const confirmed = await confirm({
      title: `Remove the rule for ${appLabel(rule.app)}?`,
      description: `Every version of this app may connect again, also those below ${rule.minimum}.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed) {
      save.mutate(
        rules.filter((other) => other.app !== rule.app),
        {
          onSuccess: () => toast.success('Rule removed'),
          onError: (error: Error) => toast.error(error.message),
        },
      );
    }
  };

  const addButton = mayWrite ? (
    <Tooltip
      content={
        full
          ? `There are ${versions.data?.maxRules} rules already`
          : 'Set the oldest version of an app that may connect'
      }
    >
      <span>
        <Button
          variant="primary"
          disabled={full || !versions.data}
          onClick={() => setEditing('new')}
        >
          <Plus />
          Add an app
        </Button>
      </span>
    </Tooltip>
  ) : null;

  return (
    <>
      <PageHeader
        title="Apps"
        description="An app on a phone or a television stays installed long after a newer one is out. Here you set the oldest version of each app that may still connect. Older ones are told to update, in your words."
        actions={addButton}
      />
      <ErrorNote error={versions.error} className="mb-4" />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0">
          {versions.isPending ? <Skeleton className="h-48 rounded-xl" /> : null}
          {versions.data && rules.length === 0 ? (
            <EmptyState
              icon={MonitorSmartphone}
              title="Every version may connect"
              action={addButton}
            >
              No app has a rule. That is right as long as every version you ever released still
              works with this server.
            </EmptyState>
          ) : null}
          {rules.length > 0 ? (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>App</Th>
                      <Th>Oldest version allowed</Th>
                      <Th>What older ones are told</Th>
                      <Th className="w-20" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <Tr key={rule.app}>
                        <Td className="whitespace-nowrap">
                          <p className="font-medium">{appLabel(rule.app)}</p>
                          {appLabel(rule.app) === rule.app ? null : (
                            <code className="font-mono text-[11px] text-muted-foreground">
                              {rule.app}
                            </code>
                          )}
                        </Td>
                        <Td>
                          <span className="font-mono text-[13px] tabular-nums">{rule.minimum}</span>
                        </Td>
                        <Td className="max-w-sm">
                          <p
                            className={
                              rule.message ? 'line-clamp-2' : 'line-clamp-2 text-muted-foreground'
                            }
                          >
                            {rule.message ?? STANDARD_MESSAGE}
                          </p>
                          {rule.updateUrl ? (
                            <a
                              href={rule.updateUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                            >
                              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{rule.updateUrl}</span>
                            </a>
                          ) : null}
                        </Td>
                        <Td>
                          {mayWrite ? (
                            <div className="flex justify-end gap-0.5">
                              <Tooltip content="Change">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Change the rule for ${appLabel(rule.app)}`}
                                  onClick={() => setEditing(rule)}
                                >
                                  <Pencil />
                                </Button>
                              </Tooltip>
                              <Tooltip content="Remove">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Remove the rule for ${appLabel(rule.app)}`}
                                  disabled={save.isPending}
                                  onClick={() => void askRemove(rule)}
                                >
                                  <Trash2 />
                                </Button>
                              </Tooltip>
                            </div>
                          ) : null}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader
            title="For the people who build the apps"
            description="An app takes part by naming itself in every request."
          />
          <CardContent className="grid gap-5">
            <CodeBlock
              label="Header"
              code={`${versions.data?.header ?? 'X-Onyx-Client'}: ${rules[0]?.app ?? 'android-tv'}/1.4.0`}
              note="The name of the app, a slash, its version. Requests without this header are never turned away."
            />
            <div className="grid gap-2">
              <p className="text-sm">
                An app that is too old gets status{' '}
                <code className="font-mono text-[13px]">426</code> on every address:
              </p>
              <JsonView label="Answer to an old app" value={refusalExample(rules[0])} />
              <p className="text-xs text-muted-foreground">
                The app shows the message and opens the link. The one address that still answers it
                is <code className="font-mono">/v1/meta</code>, which an app asks when it starts.
                More in the{' '}
                <Link
                  to="/api-reference?op=AppVersions_meta"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  API reference
                </Link>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <RuleDialog
        target={editing}
        rules={rules}
        saving={save.isPending}
        error={save.error}
        onClose={() => {
          save.reset();
          setEditing(null);
        }}
        onSave={(rule, replaced) =>
          save.mutate(withRule(rules, rule, replaced), {
            onSuccess: () => toast.success(`Rule for ${appLabel(rule.app)} saved`),
          })
        }
      />
    </>
  );
}

interface RuleDialogProps {
  target: AppVersionRule | 'new' | null;
  rules: readonly AppVersionRule[];
  saving: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (rule: AppVersionRule, replaced: string | null) => void;
}

function RuleDialog({ target, rules, saving, error, onClose, onSave }: RuleDialogProps) {
  const [draft, setDraft] = useState<RuleDraft>(EMPTY_RULE);
  const existing = target && target !== 'new' ? target : null;

  useEffect(() => {
    if (target) {
      setDraft(target === 'new' ? EMPTY_RULE : draftOf(target));
    }
  }, [target]);

  const set = (changes: Partial<RuleDraft>) => setDraft((current) => ({ ...current, ...changes }));
  const problem = draftProblem(draft, rules, existing?.app ?? null);
  const touched = draft.choice !== '' || draft.minimum !== '';
  // Raising the minimum stops viewers at once. Lowering it or adding a message does not.
  const raises =
    problem === null &&
    (existing === null || compareVersions(draft.minimum.trim(), existing.minimum) > 0);
  const taken = new Set(rules.map((rule) => rule.app).filter((app) => app !== existing?.app));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!problem) {
      onSave(ruleOf(draft), existing?.app ?? null);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={existing ? `Rule for ${appLabel(existing.app)}` : 'Add an app'}
        description="Versions below the one you enter are turned away."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <Field label="App">
                {(id) => (
                  <Select
                    id={id}
                    value={draft.choice}
                    onValueChange={(choice) => set({ choice })}
                    placeholder="Choose the app"
                    options={[
                      ...KNOWN_APPS.map((known) => ({
                        value: known.app,
                        label: known.label,
                        disabled: taken.has(known.app),
                      })),
                      { value: OTHER_APP, label: 'Another app' },
                    ]}
                  />
                )}
              </Field>
              <Field label="Oldest version allowed">
                {(id) => (
                  <Input
                    id={id}
                    required
                    inputMode="decimal"
                    autoComplete="off"
                    className="font-mono"
                    placeholder="1.4.0"
                    value={draft.minimum}
                    onChange={(event) => set({ minimum: event.target.value })}
                  />
                )}
              </Field>
            </div>
            {draft.choice === OTHER_APP ? (
              <Field
                label="Name the app sends"
                hint="The part before the slash in its X-Onyx-Client header."
              >
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={32}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    placeholder="set-top-box"
                    value={draft.custom}
                    onChange={(event) => set({ custom: event.target.value })}
                  />
                )}
              </Field>
            ) : null}
            <Field
              label="What the viewer is told"
              hint="Empty uses the sentence that is shown as the example."
            >
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={300}
                  placeholder={STANDARD_MESSAGE}
                  value={draft.message}
                  onChange={(event) => set({ message: event.target.value })}
                />
              )}
            </Field>
            <Field
              label="Where the newer version is"
              hint="The page of the app in its store. The app opens it from the message."
            >
              {(id) => (
                <Input
                  id={id}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={500}
                  className="font-mono text-[13px]"
                  placeholder="https://play.google.com/store/apps/details?id=…"
                  value={draft.updateUrl}
                  onChange={(event) => set({ updateUrl: event.target.value })}
                />
              )}
            </Field>
            {raises ? (
              <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <span>
                  From the moment you save, {appLabel(appOf(draft))} below version{' '}
                  <span className="font-mono">{draft.minimum.trim()}</span> stops working until the
                  viewer updates. Make sure the newer version is in the store.
                </span>
              </p>
            ) : null}
            <ErrorNote error={error} />
          </DialogBody>
          <DialogFooter>
            {problem && touched ? (
              <p className="mr-auto text-sm text-muted-foreground">{problem}</p>
            ) : null}
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={problem !== null}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
