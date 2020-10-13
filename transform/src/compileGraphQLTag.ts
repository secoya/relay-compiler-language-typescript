// const createClassicNode = require('./createClassicNode');
// const createCompatNode = require('./createCompatNode');
import { DocumentNode, FragmentDefinitionNode, OperationDefinitionNode } from "graphql";
import * as ts from 'typescript';
import { setSourceMapRange } from "typescript";
import { createClassicNode } from "./createClassicNode";
import { createCompatNode } from "./createCompatNode";
import { createModernNode } from "./createModernNode";
import { getFragmentNameParts } from "./getFragmentNameParts";
import { NormalizedOptions } from "./Options";
import { ScopeAnalyzer } from "./ScopeAnalyzer";

/**
 * Given a graphql`` tagged template literal, replace it with the appropriate
 * runtime artifact.
 */
export function compileGraphQLTag(
  ctx: ts.TransformationContext,
  opts: NormalizedOptions,
  node: ts.TaggedTemplateExpression,
  ast: DocumentNode,
  scopeAnalyzer: ScopeAnalyzer,
  fileName: string,
): ts.Expression {
  const mainDefinition = ast.definitions[0];

  if (mainDefinition.kind === 'FragmentDefinition') {
    const objPropName = getAssignedObjectPropertyName(node);
    if (objPropName) {
      if (ast.definitions.length !== 1) {
        throw new Error(
          'TSTransformRelay: Expected exactly one fragment in the ' +
          `graphql tag referenced by the property ${objPropName}.`,
        );
      }
      return createAST(ctx, opts, node, mainDefinition, fileName, scopeAnalyzer, true);
    }

    const nodeMap: { [key: string]: ts.Expression } = {};
    for (const definition of ast.definitions) {
      if (definition.kind !== 'FragmentDefinition') {
        throw new Error(
          'TSTransformRelay: Expected only fragments within this ' +
          'graphql tag.',
        );
      }

      const [, propName] = getFragmentNameParts(definition.name.value);
      nodeMap[propName] = createAST(ctx, opts, node, definition, fileName, scopeAnalyzer, false);
    }
    return createObject(nodeMap, node);
  }

  if (mainDefinition.kind === 'OperationDefinition') {
    if (ast.definitions.length !== 1) {
      throw new Error(
        'TSTransformRelay: Expected exactly one operation ' +
        '(query, mutation, or subscription) per graphql tag.',
      );
    }
    return createAST(ctx, opts, node, mainDefinition, fileName, scopeAnalyzer, true);
  }

  throw new Error(
    'TSTransformRelay: Expected a fragment, mutation, query, or ' +
    'subscription, got `' +
    mainDefinition.kind +
    '`.',
  );
}

function createAST(
  ctx: ts.TransformationContext,
  opts: NormalizedOptions,
  node: ts.TaggedTemplateExpression,
  graphqlDefinition: FragmentDefinitionNode | OperationDefinitionNode,
  fileName: string,
  scopeAnalyzer: ScopeAnalyzer,
  setSoueceMapRange: boolean,
) {
  const isCompatMode = Boolean(opts.compat);
  const isDevVariable = opts.isDevVariable;
  const artifactDirectory = opts.artifactDirectory;
  const buildCommand =
    (opts.buildCommand) || 'relay-compiler';

  const modernNode = createModernNode(ctx, opts, graphqlDefinition, fileName);
  if (isCompatMode) {
    const result = createCompatNode(
      modernNode,
      createClassicNode(ctx, scopeAnalyzer, node, graphqlDefinition, opts),
    );
    if (typeof setSourceMapRange === 'function') {
      ts.setSourceMapRange(result, ts.getSourceMapRange(node));
    }
    return result;
  }
  if (typeof setSourceMapRange === 'function') {
    ts.setSourceMapRange(modernNode, ts.getSourceMapRange(node));
  }
  return modernNode;
}

const idRegex = /^[$a-zA-Z_][$a-z0-9A-Z_]*$/;

function createStringLiteral(str: string) {
	if (typeof str !== 'string') {
		throw new TypeError(`str must be a string: ${str}`);
	}
	return ts.factory.createStringLiteral(str);
}

function createObject(obj: { [propName: string]: ts.Expression }, originalNode: ts.Node) {
  const propNames = Object.keys(obj);

  const assignments = propNames.map(propName => {
    const name = idRegex.test(propName) ? ts.factory.createIdentifier(propName) : createStringLiteral(propName);
    return ts.factory.createPropertyAssignment(name, obj[propName])
  });

  const objectLiteralNode = ts.factory.createObjectLiteralExpression(assignments, /* multiLine */ true);
  ts.setSourceMapRange(objectLiteralNode, ts.getSourceMapRange(originalNode));
  return objectLiteralNode;
}

function getAssignedObjectPropertyName(node: ts.Node): string | undefined {
  if (node.parent == null) {
    return undefined;
  }

  if (!ts.isPropertyAssignment(node.parent)) {
    return undefined;
  }

  const propName = node.parent.name;

  if (ts.isIdentifier(propName)) {
    return propName.text;
  }
  if (ts.isStringLiteral(propName)) {
    return propName.text;
  }
  return undefined;
}
