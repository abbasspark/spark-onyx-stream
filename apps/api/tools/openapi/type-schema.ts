// SPDX-License-Identifier: AGPL-3.0-only
import ts from 'typescript';

/** A JSON Schema, as OpenAPI 3.1 takes it. */
export type Schema = Record<string, unknown>;

/** Types whose content is free-form JSON: described as "anything". */
const FREE_FORM = new Set(['JsonValue', 'JsonObject', 'JsonArray', 'InputJsonValue', 'JsonNull']);
/** Types that travel as bytes. */
const BINARY = new Set(['Buffer', 'Uint8Array', 'ArrayBuffer', 'StreamableFile', 'Readable']);
/** How deep an unnamed type is followed before it is described as "anything". */
const MAX_DEPTH = 14;

const isNamedDeclaration = (symbol: ts.Symbol) =>
  (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class | ts.SymbolFlags.TypeAlias)) !==
  0;

/**
 * Turns TypeScript types into JSON Schemas, the way JSON.stringify writes
 * their values: dates become text, what is undefined is left out. Types with
 * a name become shared components, so a title is described once.
 */
export class TypeSchemas {
  /** The named types met so far, under the name they are referred to by. */
  readonly components = new Map<string, Schema>();
  private readonly namesByType = new Map<ts.Type, string>();
  private readonly bodies = new Map<string, string>();

  constructor(private readonly checker: ts.TypeChecker) {}

  /** @returns null for a type that has no value in JSON: void, undefined, never. */
  of(type: ts.Type, depth = 0): Schema | null {
    const { checker } = this;
    const flags = type.flags;

    if (flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never)) {
      return null;
    }
    if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown) || depth > MAX_DEPTH) {
      return {};
    }
    if (flags & ts.TypeFlags.Null) {
      return { type: 'null' };
    }
    if (flags & ts.TypeFlags.StringLiteral) {
      return { type: 'string', const: (type as ts.StringLiteralType).value };
    }
    if (flags & ts.TypeFlags.NumberLiteral) {
      return { type: 'number', const: (type as ts.NumberLiteralType).value };
    }
    if (flags & ts.TypeFlags.BooleanLiteral) {
      return { type: 'boolean', const: checker.typeToString(type) === 'true' };
    }
    if (flags & (ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping)) {
      return { type: 'string' };
    }
    if (flags & ts.TypeFlags.Number) {
      return { type: 'number' };
    }
    if (flags & ts.TypeFlags.Boolean) {
      return { type: 'boolean' };
    }
    // JSON has no big integers: they are written as text.
    if (flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) {
      return { type: 'string', pattern: '^-?\\d+$' };
    }
    if (flags & ts.TypeFlags.EnumLiteral && !(flags & ts.TypeFlags.Union)) {
      const value = (type as ts.LiteralType).value;
      return { type: typeof value === 'number' ? 'number' : 'string', const: value };
    }

    const named = this.nameOf(type);
    if (named && FREE_FORM.has(named.base)) {
      return {};
    }
    if (named) {
      return this.component(type, named.full, depth);
    }
    return this.build(type, depth);
  }

  /** The schema of a type, without regard to its name. */
  private build(type: ts.Type, depth: number): Schema | null {
    if (type.isUnion()) {
      return this.union(type, depth);
    }
    if (type.flags & ts.TypeFlags.TypeParameter) {
      return {};
    }
    if (type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) {
      return this.object(type, depth);
    }
    return {};
  }

  private union(type: ts.UnionType, depth: number): Schema | null {
    const members = type.types.filter(
      (member) => !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)),
    );
    const nullable = members.some((member) => member.flags & ts.TypeFlags.Null);
    const rest = members.filter((member) => !(member.flags & ts.TypeFlags.Null));
    if (rest.length === 0) {
      return nullable ? { type: 'null' } : null;
    }

    let schema: Schema;
    const literal = (flag: ts.TypeFlags) => rest.every((member) => member.flags & flag);
    if (literal(ts.TypeFlags.StringLiteral)) {
      const values = rest.map((member) => (member as ts.StringLiteralType).value);
      schema =
        values.length === 1
          ? { type: 'string', const: values[0] }
          : { type: 'string', enum: values };
    } else if (literal(ts.TypeFlags.NumberLiteral)) {
      schema = {
        type: 'number',
        enum: rest.map((member) => (member as ts.NumberLiteralType).value),
      };
    } else if (literal(ts.TypeFlags.BooleanLiteral)) {
      schema =
        rest.length === 2
          ? { type: 'boolean' }
          : { type: 'boolean', const: this.checker.typeToString(rest[0] as ts.Type) === 'true' };
    } else {
      // true | false arrive as two members beside the others: one "boolean" again.
      const booleans = rest.filter((member) => member.flags & ts.TypeFlags.BooleanLiteral);
      const others = rest.filter((member) => !(member.flags & ts.TypeFlags.BooleanLiteral));
      const schemas: Schema[] = [];
      if (booleans.length === 2) {
        schemas.push({ type: 'boolean' });
      } else {
        others.push(...booleans);
      }
      const seen = new Set<string>();
      for (const member of others) {
        const converted = this.of(member, depth + 1);
        const key = JSON.stringify(converted);
        if (converted && !seen.has(key)) {
          seen.add(key);
          schemas.push(converted);
        }
      }
      schema = schemas.length === 1 ? (schemas[0] as Schema) : { anyOf: schemas };
    }
    return nullable ? withNull(schema) : schema;
  }

  private object(type: ts.Type, depth: number): Schema | null {
    const { checker } = this;
    const symbolName = type.symbol?.name ?? type.aliasSymbol?.name ?? '';

    if (symbolName === 'Date') {
      return { type: 'string', format: 'date-time' };
    }
    if (symbolName === 'Decimal') {
      return { type: 'string' };
    }
    if (BINARY.has(symbolName)) {
      return { type: 'string', format: 'binary' };
    }
    if (symbolName === 'Promise') {
      const [inner] = checker.getTypeArguments(type as ts.TypeReference);
      return inner ? this.of(inner, depth) : {};
    }
    if (checker.isTupleType(type)) {
      const items = checker
        .getTypeArguments(type as ts.TypeReference)
        .map((item) => this.of(item, depth + 1) ?? {});
      return { type: 'array', prefixItems: items, minItems: items.length, maxItems: items.length };
    }
    if (checker.isArrayType(type) || symbolName === 'ReadonlyArray') {
      const [item] = checker.getTypeArguments(type as ts.TypeReference);
      return { type: 'array', items: (item && this.of(item, depth + 1)) ?? {} };
    }
    if (symbolName === 'Map' || symbolName === 'Set' || symbolName === 'WeakMap') {
      return {};
    }
    // A function is not data.
    if (type.getCallSignatures().length > 0 && type.getProperties().length === 0) {
      return null;
    }

    const properties: Record<string, Schema> = {};
    const required: string[] = [];
    for (const property of checker.getPropertiesOfType(type)) {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (
        property.flags & ts.SymbolFlags.Method ||
        (declaration && ts.isMethodSignature(declaration)) ||
        property.name.startsWith('__')
      ) {
        continue;
      }
      const propertyType = declaration
        ? checker.getTypeOfSymbolAtLocation(property, declaration)
        : checker.getTypeOfSymbol(property);
      const schema = this.of(propertyType, depth + 1);
      if (!schema) {
        continue;
      }
      const text = ts.displayPartsToString(property.getDocumentationComment(checker)).trim();
      properties[property.name] = text ? describe(schema, text) : schema;
      const optional =
        (property.flags & ts.SymbolFlags.Optional) !== 0 ||
        (propertyType.isUnion() &&
          propertyType.types.some((member) => member.flags & ts.TypeFlags.Undefined));
      if (!optional) {
        required.push(property.name);
      }
    }

    const schema: Schema = { type: 'object', properties };
    if (required.length > 0) {
      schema.required = required;
    }
    const index = checker.getIndexInfoOfType(type, ts.IndexKind.String);
    if (index) {
      schema.additionalProperties = this.of(index.type, depth + 1) ?? {};
      if (Object.keys(properties).length === 0) {
        delete schema.properties;
      }
    }
    return schema;
  }

  /** The name a type goes by, when it has one worth keeping. */
  private nameOf(type: ts.Type): { base: string; full: string } | null {
    const alias = type.aliasSymbol;
    const symbol = alias ?? type.symbol;
    if (!symbol || !isNamedDeclaration(symbol) || symbol.name.startsWith('__')) {
      return null;
    }
    const base = symbol.name;
    // What the language itself brings is described by its shape, not its name.
    const declaration = symbol.declarations?.[0];
    if (!declaration || /typescript\/lib\/lib\./.test(declaration.getSourceFile().fileName)) {
      return null;
    }
    if (BINARY.has(base) || base === 'Decimal') {
      return null;
    }
    // Helper types that only wrap another type say nothing by their name.
    if (
      /^(Omit|Pick|Partial|Required|Readonly|Record|Awaited|Exclude|Extract|NonNullable)$/.test(
        base,
      )
    ) {
      return null;
    }
    const args = alias
      ? (type.aliasTypeArguments ?? [])
      : this.checker.getTypeArguments(type as ts.TypeReference);
    const suffix = args
      .map((arg) => this.nameOf(arg)?.full ?? this.checker.typeToString(arg))
      .map((name) => name.replaceAll(/[^A-Za-z0-9]+/g, ''))
      .filter(Boolean);
    return { base, full: [base, ...suffix].join('Of') };
  }

  /** Describes a named type once and refers to it from then on. */
  private component(type: ts.Type, wanted: string, depth: number): Schema | null {
    const known = this.namesByType.get(type);
    if (known) {
      return { $ref: `#/components/schemas/${known}` };
    }
    // The name is taken at once, so a type that contains itself finds it.
    let name = wanted;
    for (let attempt = 2; this.components.has(name); attempt += 1) {
      name = `${wanted}${attempt}`;
    }
    this.namesByType.set(type, name);
    this.components.set(name, {});
    const schema = this.build(type, depth);
    if (!schema) {
      this.components.delete(name);
      this.namesByType.delete(type);
      return null;
    }

    // Two types with one name and one shape are one component.
    const body = JSON.stringify(schema);
    const twin = [...this.bodies].find(
      ([other, otherBody]) => otherBody === body && other.replace(/\d+$/, '') === wanted,
    );
    if (twin && name !== wanted) {
      this.components.delete(name);
      this.namesByType.set(type, twin[0]);
      return { $ref: `#/components/schemas/${twin[0]}` };
    }
    this.bodies.set(name, body);
    this.components.set(name, schema);
    return { $ref: `#/components/schemas/${name}` };
  }
}

function withNull(schema: Schema): Schema {
  if (typeof schema.type === 'string' && !('const' in schema) && !('enum' in schema)) {
    return { ...schema, type: [schema.type, 'null'] };
  }
  return { anyOf: [schema, { type: 'null' }] };
}

/** A description beside a reference needs a wrapper: a reference stands alone. */
function describe(schema: Schema, description: string): Schema {
  return '$ref' in schema ? { allOf: [schema], description } : { ...schema, description };
}
