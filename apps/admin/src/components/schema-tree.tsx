// SPDX-License-Identifier: AGPL-3.0-only
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import {
  type JsonSchema,
  limitsOf,
  type OpenApiDocument,
  resolveSchema,
  splitNull,
  typeLabel,
} from '@/lib/openapi';

/** What is inside a schema that is worth opening: the fields of an object, also of a list of them. */
function innerOf(input: JsonSchema, document: OpenApiDocument): JsonSchema | null {
  const { schema } = resolveSchema(splitNull(input).schema, document);
  if (schema.properties && Object.keys(schema.properties).length > 0) {
    return schema;
  }
  if (schema.items) {
    return innerOf(schema.items, document);
  }
  if (schema.anyOf) {
    for (const member of schema.anyOf) {
      const inner = innerOf(member, document);
      if (inner) {
        return inner;
      }
    }
  }
  return null;
}

function enumOf(input: JsonSchema, document: OpenApiDocument): unknown[] | null {
  const { schema } = resolveSchema(splitNull(input).schema, document);
  const values = schema.enum ?? schema.items?.enum ?? null;
  return values && values.length > 4 ? values : null;
}

interface SchemaTreeProps {
  schema: JsonSchema;
  document: OpenApiDocument;
  /** Says what the fields belong to, for screen readers. */
  label: string;
}

/**
 * The fields of a schema, each with its type and what it means. A field that
 * holds more fields opens in place, so a deep answer can be read level by level.
 */
export function SchemaTree({ schema, document, label }: SchemaTreeProps) {
  const inner = innerOf(schema, document);
  if (!inner?.properties) {
    return (
      <p className="font-mono text-[13px] text-muted-foreground">{typeLabel(schema, document)}</p>
    );
  }
  const required = new Set(inner.required ?? []);
  return (
    <ul className="divide-y rounded-lg border" aria-label={label}>
      {Object.entries(inner.properties).map(([name, property]) => (
        <Field
          key={name}
          name={name}
          schema={property}
          required={required.has(name)}
          document={document}
        />
      ))}
    </ul>
  );
}

function Field({
  name,
  schema,
  required,
  document,
}: {
  name: string;
  schema: JsonSchema;
  required: boolean;
  document: OpenApiDocument;
}) {
  const [open, setOpen] = useState(false);
  const inner = innerOf(schema, document);
  const resolved = resolveSchema(splitNull(schema).schema, document).schema;
  const description = schema.description ?? resolved.description;
  const limits = limitsOf(resolved);
  const values = enumOf(schema, document);
  const type = typeLabel(schema, document);

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {inner ? (
          <button
            type="button"
            className="-ml-1 flex items-center gap-1 rounded-sm font-mono text-[13px] font-medium hover:text-primary"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <ChevronRight
              className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
              aria-hidden="true"
            />
            {name}
          </button>
        ) : (
          <span className="font-mono text-[13px] font-medium">{name}</span>
        )}
        <span className="font-mono text-xs break-all text-muted-foreground">{type}</span>
        {required ? null : <span className="text-xs text-muted-foreground">optional</span>}
      </div>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {limits.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{limits.join(', ')}</p>
      ) : null}
      {values ? (
        <p className="mt-1.5 flex flex-wrap gap-1">
          {values.map((value) => (
            <code
              key={String(value)}
              className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]"
            >
              {String(value)}
            </code>
          ))}
        </p>
      ) : null}
      {inner && open ? (
        <div className="mt-2.5 ml-1 border-l pl-3">
          <SchemaTree schema={inner} document={document} label={`Fields of ${name}`} />
        </div>
      ) : null}
    </li>
  );
}
