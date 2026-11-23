// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import ts from 'typescript';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
const HTTP_DECORATORS: Record<string, HttpMethod> = {
  Get: 'get',
  Post: 'post',
  Put: 'put',
  Patch: 'patch',
  Delete: 'delete',
};

/** Who may call an endpoint. */
export interface Access {
  kind: 'public' | 'viewer' | 'admin';
  /** Permissions an admin or an API key needs, all of them. */
  permissions: string[];
  /** Whether API keys are turned away. */
  sessionOnly: boolean;
}

/** Where the Zod schema of an input is written, when it can be loaded by itself. */
export interface SchemaSource {
  file: string;
  exportName: string;
}

export interface RouteInput {
  /** The declared type of the parameter, after validation. */
  type: ts.Type;
  schema: SchemaSource | null;
}

export interface PathParameter {
  name: string;
  format: 'uuid' | 'integer' | null;
}

export interface Route {
  /** A name for generated clients: "Webhooks_create". */
  operationId: string;
  method: HttpMethod;
  /** With the prefix and with {braces}: "/v1/webhooks/{id}". */
  path: string;
  /** The folder the controller is in, which groups endpoints. */
  area: string;
  summary: string;
  description: string;
  access: Access;
  pathParameters: PathParameter[];
  queryParameters: string[];
  query: RouteInput | null;
  body: RouteInput | null;
  /** Whether the body is a form with a file. */
  upload: boolean;
  status: number;
  /** What the handler returns, with promises unwrapped. */
  returns: ts.Type;
  /** The handler writes the answer itself: a file, a stream, a redirect. */
  raw: boolean;
  rateLimited: boolean;
  /** Where it is written, for messages. */
  source: string;
}

const decoratorsOf = (node: ts.Node) =>
  ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];

function decoratorCall(
  decorator: ts.Decorator,
): { name: string; args: readonly ts.Expression[] } | null {
  const expression = decorator.expression;
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    return { name: expression.expression.text, args: expression.arguments };
  }
  return null;
}

/** Finds every endpoint in the controllers of a program. */
export function findRoutes(program: ts.Program, sourceRoot: string, prefix: string): Route[] {
  const checker = program.getTypeChecker();
  const routes: Route[] = [];

  /** The texts an expression stands for: a literal, a constant, or a list of them. */
  const textsOf = (expression: ts.Expression | undefined): string[] => {
    if (!expression) {
      return [''];
    }
    if (ts.isArrayLiteralExpression(expression)) {
      return expression.elements.flatMap((element) => textsOf(element));
    }
    const type = checker.getTypeAtLocation(expression);
    if (type.isStringLiteral()) {
      return [type.value];
    }
    throw new Error(
      `Cannot read the path "${expression.getText()}" in ${expression.getSourceFile().fileName}`,
    );
  };

  const schemaSourceOf = (expression: ts.Expression): SchemaSource | null => {
    if (!ts.isIdentifier(expression)) {
      return null;
    }
    let symbol = checker.getSymbolAtLocation(expression);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    const declaration = symbol?.valueDeclaration;
    if (!declaration || !ts.isVariableDeclaration(declaration)) {
      return null;
    }
    const statement = declaration.parent.parent;
    const exported =
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const file = declaration.getSourceFile().fileName;
    // A controller cannot be loaded for one constant: it brings the whole server with it.
    if (!exported || file.endsWith('.controller.ts')) {
      return null;
    }
    return { file, exportName: declaration.name.getText() };
  };

  /** The schema inside "new ZodValidationPipe(schema)", among the arguments of a decorator. */
  const inputOf = (
    parameter: ts.ParameterDeclaration,
    args: readonly ts.Expression[],
  ): RouteInput => {
    const pipe = args.find(
      (arg): arg is ts.NewExpression =>
        ts.isNewExpression(arg) && arg.expression.getText() === 'ZodValidationPipe',
    );
    const schema = pipe?.arguments?.[0] ? schemaSourceOf(pipe.arguments[0]) : null;
    return { type: checker.getTypeAtLocation(parameter), schema };
  };

  for (const file of program.getSourceFiles()) {
    const relative = path.relative(sourceRoot, file.fileName);
    if (file.isDeclarationFile || relative.startsWith('..') || relative.endsWith('.spec.ts')) {
      continue;
    }
    const area = relative.split(path.sep)[0] ?? '';

    file.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) {
        return;
      }
      const classDecorators = decoratorsOf(node)
        .map(decoratorCall)
        .filter((call) => call !== null);
      const controller = classDecorators.find((call) => call.name === 'Controller');
      if (!controller) {
        return;
      }
      const bases = textsOf(controller.args[0]);
      const className = node.name.text.replace(/Controller$/, '');

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) {
          continue;
        }
        const calls = decoratorsOf(member)
          .map(decoratorCall)
          .filter((call) => call !== null);
        const http = calls.find((call) => call.name in HTTP_DECORATORS);
        if (!http) {
          continue;
        }
        const method = HTTP_DECORATORS[http.name] as HttpMethod;
        const has = (name: string) =>
          calls.some((call) => call.name === name) ||
          classDecorators.some((call) => call.name === name);
        const permissions = (
          calls.find((call) => call.name === 'RequirePermissions') ??
          classDecorators.find((call) => call.name === 'RequirePermissions')
        )?.args.flatMap((arg) => textsOf(arg));

        const access: Access = {
          kind: has('Public') ? 'public' : has('ViewerOnly') ? 'viewer' : 'admin',
          permissions: permissions ?? [],
          sessionOnly: has('AdminSessionOnly'),
        };

        const pathParameters: PathParameter[] = [];
        const queryParameters: string[] = [];
        let query: RouteInput | null = null;
        let body: RouteInput | null = null;
        let raw = false;
        let upload = false;
        for (const parameter of member.parameters) {
          for (const call of decoratorsOf(parameter).map(decoratorCall)) {
            if (!call) {
              continue;
            }
            const [first] = call.args;
            const firstType = first ? checker.getTypeAtLocation(first) : undefined;
            const named = firstType?.isStringLiteral() ? firstType.value : undefined;
            if (call.name === 'Param' && named) {
              const pipes = call.args.slice(1).map((arg) => arg.getText());
              pathParameters.push({
                name: named,
                format: pipes.some((pipe) => pipe.includes('ParseUUIDPipe'))
                  ? 'uuid'
                  : pipes.some((pipe) => pipe.includes('ParseIntPipe'))
                    ? 'integer'
                    : null,
              });
            } else if (call.name === 'Query') {
              if (named) {
                queryParameters.push(named);
              } else {
                query = inputOf(parameter, call.args);
              }
            } else if (call.name === 'Body') {
              body = inputOf(parameter, call.args);
            } else if (call.name === 'Res') {
              // With "passthrough" the handler still returns the answer itself.
              raw = !call.args.some((arg) => arg.getText().includes('passthrough'));
            } else if (call.name === 'UploadedFile' || call.name === 'UploadedFiles') {
              upload = true;
            }
          }
        }

        const code = calls.find((call) => call.name === 'HttpCode')?.args[0];
        const explicit = code ? checker.getTypeAtLocation(code) : null;
        const status =
          explicit && explicit.isNumberLiteral() ? explicit.value : method === 'post' ? 201 : 200;

        const signature = checker.getSignatureFromDeclaration(member);
        const returned = signature
          ? checker.getReturnTypeOfSignature(signature)
          : checker.getAnyType();
        const returns = checker.getAwaitedType(returned) ?? returned;

        const comment = ts
          .displayPartsToString(
            checker.getSymbolAtLocation(member.name)?.getDocumentationComment(checker),
          )
          .replaceAll(/\s*\n\s*/g, ' ')
          .trim();
        const [summary = '', ...rest] = comment.split(/(?<=[.!?])\s+/);

        for (const base of bases) {
          for (const tail of textsOf(http.args[0])) {
            const joined = [prefix, base, tail]
              .flatMap((part) => part.split('/'))
              .filter(Boolean)
              .map((part) =>
                part.startsWith(':')
                  ? `{${part.slice(1)}}`
                  : part.startsWith('*')
                    ? `{${part.slice(1) || 'path'}}`
                    : part,
              )
              .join('/');
            routes.push({
              operationId: `${className}_${member.name.text}`,
              method,
              path: `/${joined}`,
              area,
              summary: summary.replace(/\.$/, ''),
              description: rest.join(' '),
              access,
              pathParameters,
              queryParameters,
              query,
              body,
              upload,
              status,
              returns,
              raw,
              rateLimited: calls.some((call) => call.name === 'RateLimit'),
              source: `${relative}:${className}.${member.name.text}`,
            });
          }
        }
      }
    });
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}
