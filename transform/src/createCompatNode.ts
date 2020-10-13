import * as ts from "typescript";
/**
 * Relay Compat transforms graphql definitions into objects with `modern` and
 * `classic` keys, each containing the resulting transforms.
 */
export function createCompatNode(
  modernNode: ts.Expression,
  classicNode: ts.Expression
): ts.Expression {
  return ts.factory.createObjectLiteralExpression([
    ts.factory.createPropertyAssignment(ts.factory.createIdentifier('modern'), modernNode),
    ts.factory.createPropertyAssignment(ts.factory.createIdentifier('classic'), classicNode),
  ], true);
}

