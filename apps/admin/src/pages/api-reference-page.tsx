// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronRight,
  Download,
  Globe,
  KeyRound,
  Lock,
  Search,
  SearchX,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { apiUrl } from '@/api/client';
import { referenceApi } from '@/api/endpoints';
import { CodeBlock } from '@/components/code-block';
import { SchemaTree } from '@/components/schema-tree';
import { Button } from '@/components/ui/button';
import {
  Badge,
  type BadgeTone,
  Card,
  CardContent,
  CardHeader,
  ErrorNote,
  PageHeader,
  Skeleton,
} from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import {
  type AccessFilter,
  accessLabel,
  curlFor,
  groupOperations,
  type HttpMethod,
  isSuccess,
  listOperations,
  matchesOperation,
  type OpenApiDocument,
  type Operation,
  shortPath,
  titleOf,
} from '@/lib/openapi';

/** The address of the API as a terminal on another machine needs it: in full. */
const absolute = (path: string) => new URL(apiUrl(path), window.location.origin).href;

const METHOD_TONES: Record<HttpMethod, BadgeTone> = {
  get: 'info',
  post: 'success',
  put: 'warning',
  patch: 'warning',
  delete: 'danger',
};

const ACCESS_FILTERS: { value: AccessFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Open' },
  { value: 'viewer', label: 'Viewers' },
  { value: 'admin', label: 'Admins' },
];

function Method({ method, className }: { method: HttpMethod; className?: string }) {
  return (
    <Badge
      tone={METHOD_TONES[method]}
      className={cn('w-14 justify-center rounded-md px-0 font-mono text-[11px]', className)}
    >
      {method.toUpperCase()}
    </Badge>
  );
}

/** Every endpoint of the API, read from the description the server gives of itself. */
export function ApiReferencePage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [access, setAccess] = useState<AccessFilter>('all');
  /** Areas opened by hand. The area of the endpoint on show is open as well. */
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const reference = useQuery({
    queryKey: ['api-reference'],
    queryFn: ({ signal }) => referenceApi.document(signal),
    staleTime: Infinity,
  });
  const document = reference.data;
  const operations = useMemo(() => (document ? listOperations(document) : []), [document]);
  const selected = operations.find((operation) => operation.id === params.get('op')) ?? null;
  const searching = query.trim() !== '' || access !== 'all';
  const groups = useMemo(
    () =>
      document
        ? groupOperations(
            document,
            operations.filter((operation) => matchesOperation(operation, query, access)),
          )
        : [],
    [document, operations, query, access],
  );
  const found = groups.reduce((sum, group) => sum + group.operations.length, 0);

  const select = (id: string | null) =>
    setParams(id ? { op: id } : {}, { replace: false, preventScrollReset: true });
  const toggle = (name: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });

  return (
    <>
      <PageHeader
        title="API reference"
        description="Everything the panel, the website and the apps do goes through the API, and so can your own programs. This page is read from the description the server gives of itself, so it matches this installation."
        actions={
          <Button asChild>
            <a href={apiUrl('/v1/openapi.json')} download="openapi.json">
              <Download />
              OpenAPI file
            </a>
          </Button>
        }
      />
      <ErrorNote error={reference.error} className="mb-4" />
      {reference.isPending ? <Skeleton className="h-96 rounded-xl" /> : null}

      {document ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
          <Card
            className={cn(
              'overflow-hidden lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100dvh-6.5rem)] lg:flex-col',
              // On a phone the list makes room for the endpoint that was chosen.
              selected && 'hidden lg:flex',
            )}
          >
            <div className="grid gap-3 border-b p-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  className="pl-9"
                  placeholder="Find an endpoint"
                  aria-label="Find an endpoint"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div
                className="flex rounded-md border p-0.5"
                role="radiogroup"
                aria-label="Who may call"
              >
                {ACCESS_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    role="radio"
                    aria-checked={access === filter.value}
                    className={cn(
                      'flex-1 rounded-[5px] px-2 py-1 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                      access === filter.value && 'bg-accent text-foreground',
                    )}
                    onClick={() => setAccess(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                {searching
                  ? `${found} of ${operations.length} endpoints`
                  : `${operations.length} endpoints in ${groups.length} areas`}
              </p>
            </div>

            <nav className="min-h-0 overflow-y-auto p-1.5 lg:flex-1" aria-label="Endpoints">
              {groups.length === 0 ? (
                <p className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                  <SearchX className="size-5" aria-hidden="true" />
                  Nothing fits. Try a word from the address, such as "titles".
                </p>
              ) : null}
              {groups.map((group) => {
                const open = searching || opened.has(group.name) || selected?.tag === group.name;
                return (
                  <div key={group.name}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-accent"
                      aria-expanded={open}
                      onClick={() => toggle(group.name)}
                    >
                      <ChevronRight
                        className={cn(
                          'size-3.5 shrink-0 text-muted-foreground transition-transform',
                          open && 'rotate-90',
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">
                        {group.operations.length}
                      </span>
                    </button>
                    {open ? (
                      <ul className="mb-1.5 grid gap-px">
                        {group.operations.map((operation) => (
                          <li key={operation.id}>
                            <button
                              type="button"
                              className={cn(
                                'flex w-full items-center gap-2 rounded-md py-1.5 pr-2 pl-3 text-left hover:bg-accent',
                                selected?.id === operation.id && 'bg-accent',
                              )}
                              aria-current={selected?.id === operation.id ? 'true' : undefined}
                              onClick={() => select(operation.id)}
                            >
                              <Method method={operation.method} className="w-12 shrink-0" />
                              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                {shortPath(operation.path)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          </Card>

          <div className="min-w-0">
            {selected ? (
              <OperationDetail
                key={selected.id}
                operation={selected}
                document={document}
                onBack={() => select(null)}
              />
            ) : (
              <Overview document={document} operations={operations} />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** What shows before an endpoint is chosen: how to reach the API and how to sign in. */
function Overview({
  document,
  operations,
}: {
  document: OpenApiDocument;
  operations: Operation[];
}) {
  const count = (kind: Operation['access']['kind']) =>
    operations.filter((operation) => operation.access.kind === kind).length;
  const ways = [
    {
      icon: Globe,
      title: 'Open to everyone',
      count: count('public'),
      text: 'The catalog as the website shows it, sign-in and sign-up of viewers, and the files players load. No sign-in is sent.',
    },
    {
      icon: UserRound,
      title: 'For a signed-in viewer',
      count: count('viewer'),
      text: 'Profiles, My list, where a viewer stopped, their payments. Signing in answers with a token. Apps send it as "Authorization: Bearer", the website keeps it in a cookie.',
    },
    {
      icon: KeyRound,
      title: 'For admins and API keys',
      count: count('admin'),
      text: 'Everything the panel does. A script sends an API key as "Authorization: Bearer" and can do what the scopes of the key allow. A few endpoints take a signed-in admin only.',
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-5">
      <Card>
        <CardHeader
          title="Where the API is"
          description={`Version ${document.info.version} of the server. Every address starts with /v1.`}
        />
        <CardContent>
          <CodeBlock
            label="An open call"
            code={`curl '${absolute('/v1/meta')}'`}
            note="Answers with the name of the site and the version of the server. Apps ask this first."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Who may call what"
          description="Each endpoint says which of the three it is."
        />
        <ul className="grid grid-cols-1 divide-y border-t md:grid-cols-3 md:divide-x md:divide-y-0">
          {ways.map((way) => (
            <li key={way.title} className="grid content-start gap-1.5 p-5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <way.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                {way.title}
              </p>
              <p className="text-2xl font-semibold tabular-nums">{way.count}</p>
              <p className="text-sm text-muted-foreground">{way.text}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Good to know" />
        <CardContent>
          <ul className="grid gap-3 text-sm">
            <li>
              <span className="font-medium">Errors look the same everywhere.</span>{' '}
              <span className="text-muted-foreground">
                A status, a message a person can read, and on a refused input a list of the fields
                that were wrong.
              </span>
            </li>
            <li>
              <span className="font-medium">Dates are text in ISO 8601,</span>{' '}
              <span className="text-muted-foreground">
                such as 2026-01-15T09:30:00.000Z, always in UTC.
              </span>
            </li>
            <li>
              <span className="font-medium">Apps name themselves</span>{' '}
              <span className="text-muted-foreground">
                in the X-Onyx-Client header, so a version that is too old can be told to update. The
                oldest versions allowed are set under{' '}
                <Link to="/apps" className="text-primary underline-offset-4 hover:underline">
                  Apps
                </Link>
                .
              </span>
            </li>
            <li>
              <span className="font-medium">Types for your own code</span>{' '}
              <span className="text-muted-foreground">
                can be generated from the OpenAPI file, for TypeScript, Kotlin, Swift and most other
                languages.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function OperationDetail({
  operation,
  document,
  onBack,
}: {
  operation: Operation;
  document: OpenApiDocument;
  onBack: () => void;
}) {
  const successes = operation.answers.filter((answer) => isSuccess(answer.status));
  const failures = operation.answers.filter((answer) => !isSuccess(answer.status));
  const AccessIcon =
    operation.access.kind === 'public'
      ? Globe
      : operation.access.kind === 'viewer'
        ? UserRound
        : Lock;
  const inPath = operation.parameters.filter((parameter) => parameter.in === 'path');
  const inQuery = operation.parameters.filter((parameter) => parameter.in === 'query');

  return (
    <div className="grid grid-cols-1 gap-5">
      <Card>
        <CardContent className="grid gap-4">
          <button
            type="button"
            className="-mb-1 inline-flex items-center gap-1 justify-self-start text-sm text-muted-foreground hover:text-foreground lg:hidden"
            onClick={onBack}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            All endpoints
          </button>
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">{operation.tag}</p>
            <h2 className="text-lg leading-snug font-semibold">{titleOf(operation)}</h2>
          </div>
          <p className="flex items-start gap-2.5 rounded-lg border bg-muted/50 px-3 py-2.5">
            <Method method={operation.method} className="mt-px shrink-0" />
            <code className="min-w-0 font-mono text-[13px] leading-6 break-all">
              {operation.path}
            </code>
          </p>
          {operation.description ? (
            <p className="max-w-prose text-sm text-muted-foreground">{operation.description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={operation.access.kind === 'public' ? 'success' : 'neutral'}>
              <AccessIcon className="size-3" aria-hidden="true" />
              {accessLabel(operation.access)}
            </Badge>
            {operation.access.permissions.map((permission) => (
              <Badge key={permission} tone="primary" className="font-mono text-[11px]">
                <ShieldCheck className="size-3" aria-hidden="true" />
                {permission}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {inPath.length + inQuery.length > 0 ? (
        <Card>
          <CardHeader title="What it takes in the address" className="pb-4" />
          <ul className="divide-y border-t">
            {[...inPath, ...inQuery].map((parameter) => (
              <li key={`${parameter.in}-${parameter.name}`} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-[13px] font-medium">{parameter.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {parameter.in === 'path' ? 'in the address' : 'after the question mark'}
                    {parameter.in === 'query' && !parameter.required ? ', optional' : ''}
                  </span>
                </div>
                {parameter.schema ? (
                  <div className="mt-1">
                    <SchemaTree
                      schema={parameter.schema}
                      document={document}
                      label={`Type of ${parameter.name}`}
                    />
                  </div>
                ) : null}
                {parameter.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{parameter.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {operation.body ? (
        <Card>
          <CardHeader
            title="What it is sent"
            description={
              operation.body.contentType === 'application/json'
                ? 'A JSON body with these fields.'
                : `A form (${operation.body.contentType}) with the file.`
            }
          />
          <CardContent>
            <SchemaTree
              schema={operation.body.schema}
              document={document}
              label="Fields of the body"
            />
          </CardContent>
        </Card>
      ) : null}

      {successes.map((answer) => (
        <Card key={answer.status}>
          <CardHeader
            title={
              <>
                What comes back
                <Badge tone="success" className="font-mono text-[11px]">
                  {answer.status}
                </Badge>
              </>
            }
            description={answer.schema ? undefined : answer.description}
          />
          {answer.schema ? (
            <CardContent>
              <SchemaTree schema={answer.schema} document={document} label="Fields of the answer" />
            </CardContent>
          ) : (
            <div className="pb-5" />
          )}
        </Card>
      ))}

      {failures.length > 0 ? (
        <Card>
          <CardHeader title="When it does not work" className="pb-4" />
          <ul className="divide-y border-t">
            {failures.map((answer) => (
              <li key={answer.status} className="flex items-baseline gap-3 px-5 py-2.5 text-sm">
                <Badge
                  tone={answer.status.startsWith('5') ? 'danger' : 'warning'}
                  className="font-mono text-[11px]"
                >
                  {answer.status}
                </Badge>
                <span className="text-muted-foreground">{answer.description}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Try it" />
        <CardContent>
          <CodeBlock
            label="Command"
            code={curlFor(operation, absolute('/').replace(/\/$/, ''), document)}
            note={
              operation.access.kind === 'public'
                ? 'Replace what is in angle brackets, then paste it into a terminal.'
                : 'Replace what is in angle brackets. Keep tokens and keys out of places others can read.'
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
