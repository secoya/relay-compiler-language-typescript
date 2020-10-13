import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as ts from 'typescript';

import { print } from "graphql";

const GENERATED = './__generated__/';

import { FragmentDefinitionNode, OperationDefinitionNode } from "graphql";
import { NormalizedOptions } from "./Options";

function createVariableStatement(type: ts.NodeFlags.Const | ts.NodeFlags.Let | undefined, name: ts.Identifier, initializer: ts.Expression): ts.VariableStatement {
  return ts.factory.createVariableStatement(
    undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          name,
          undefined,
          undefined,
          initializer
        ),
      ],
      type,
    ),
  );
}

function createStringLiteral(str: string) {
	if (typeof str !== 'string') {
		throw new TypeError(`str must be a string: ${str}`);
	}
	return ts.factory.createStringLiteral(str);
}

/**
 * Relay Modern creates separate generated files, so TS transforms graphql
 * definitions to lazy require function calls.
 */
export function createModernNode(
  ctx: ts.TransformationContext,
  opts: NormalizedOptions,
  graphqlDefinition: OperationDefinitionNode | FragmentDefinitionNode,
  fileName: string,
): ts.Expression {
  const definitionName = graphqlDefinition.name && graphqlDefinition.name.value;
  if (!definitionName) {
    throw new Error('GraphQL operations and fragments must contain names');
  }
  const requiredFile = definitionName + '.graphql.ts';
  const requiredPath = opts.artifactDirectory
    ? getRelativeImportPath(fileName, opts.artifactDirectory, requiredFile)
    : GENERATED + requiredFile;

  const hash = crypto
    .createHash('md5')
    .update(print(graphqlDefinition), 'utf8')
    .digest('hex');

  const requireGraphQLModule = ts.factory.createPropertyAccessExpression(
    ts.factory.createCallExpression(
      ts.factory.createIdentifier('require'),
      undefined,
      [createStringLiteral(requiredPath)],
    ), ts.factory.createIdentifier('default'));

  const bodyStatements: ts.Statement[] = [ts.factory.createReturnStatement(requireGraphQLModule)];
  if (opts.isDevVariable != null || opts.isDevelopment) {
    const nodeVariable = ts.factory.createIdentifier('node');
    const nodeDotHash = ts.factory.createPropertyAccessExpression(nodeVariable, ts.factory.createIdentifier('hash'));
    let checkStatements: ts.Statement[] = [
      createVariableStatement(ts.NodeFlags.Const, nodeVariable, requireGraphQLModule),
      ts.factory.createIfStatement(
        ts.factory.createLogicalAnd(
          nodeDotHash,
          ts.factory.createStrictInequality(nodeDotHash, createStringLiteral(hash)),
        ),
        ts.factory.createBlock([
          ts.factory.createExpressionStatement(
            warnNeedsRebuild(definitionName, opts.buildCommand),
          ),
        ], /* multiLine */ true),
      ),
    ];
    if (opts.isDevVariable != null) {
      checkStatements = [
        ts.factory.createIfStatement(
          ts.factory.createIdentifier(opts.isDevVariable),
          ts.factory.createBlock(checkStatements, /* multiLine */ true),
        ),
      ];
    }
    bodyStatements.unshift(...checkStatements);
  }
  return ts.factory.createFunctionExpression(undefined, undefined, undefined, undefined, [], undefined, ts.factory.createBlock(bodyStatements, /* multiLine */ true));
}

function warnNeedsRebuild(
  definitionName: string,
  buildCommand?: string,
): ts.Expression {
  return ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('console'), ts.factory.createIdentifier('error')),
    undefined,
    [
      createStringLiteral(
        `The definition of '${definitionName}' appears to have changed. Run ` +
        '`' +
        (buildCommand || 'relay-compiler') +
        '` to update the generated files to receive the expected data.',
      ),
    ],
  );
}

function getRelativeImportPath(
  fileName: string,
  artifactDirectory: string,
  fileToRequire: string,
): string {
  return path.join(artifactDirectory, fileToRequire);
}
