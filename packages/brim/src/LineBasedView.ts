import { TreeFunctionDefinitionNode, NameNode, BodyExpressionNode, isStreamExpressionNode, isFunctionExpressionNode, NodeKind, StreamExpressionNode, StreamReferenceNode, FunctionExpressionNode, FunctionDefinitionNode, TreeFunctionBodyNode } from "./Tree";
import { EnvironmentLookups } from "./EditReducer";

function getFunctionNodeAndDisplayName(funcRef: FunctionExpressionNode, envLookups: EnvironmentLookups): [FunctionDefinitionNode, string] {
  if (funcRef.kind !== NodeKind.FunctionReference) {
    throw new Error();
  }

  const nearestDef = envLookups.nodeToNearestTreeDef.get(funcRef);
  if (!nearestDef) {
    throw new Error();
  }

  const nodeFunctionEnv = envLookups.treeDefToFunctionEnv.get(nearestDef);
  if (!nodeFunctionEnv) {
    throw new Error();
  }

  const functionNode = nodeFunctionEnv.get(funcRef.ref);
  if (!functionNode) {
    throw new Error();
  }

  const displayName = functionNode.name ? functionNode.name.text : ('<function ' + funcRef.ref + '>');

  return [functionNode, displayName];
}

interface SingleLineNode {
  kind: 'single';
  items: ReadonlyArray<string | SingleLineNode>;
}

interface MultiLineNodeRow {
  indent: boolean;
  item: EitherLineNode;
}

interface MultiLineNode {
  kind: 'multi';
  rows: ReadonlyArray<MultiLineNodeRow>;
}

type EitherLineNode = SingleLineNode | MultiLineNode;

const WRAP_LIMIT = 24;

function getSingleLineWidth(node: SingleLineNode): number {
  let sum = 0;

  for (const item of node.items) {
    if (typeof item === 'string') {
      sum += item.length;
    } else {
      sum += getSingleLineWidth(item);
    }
  }

  return sum;
}

interface LabeledNode {
  label?: string;
  node?: EitherLineNode;
}

function labeledNodesView(labeledNodes: ReadonlyArray<LabeledNode>): EitherLineNode {
  if (labeledNodes.every(labeledNode => !labeledNode.node || labeledNode.node.kind === 'single')) {
    // There are no multi-line children, so take a shot at making this single-line
    const items: Array<string | SingleLineNode> = [];

    for (const labeledNode of labeledNodes) {
      if (labeledNode.label) {
        items.push(labeledNode.label);
      }
      if (labeledNode.node) {
        items.push(labeledNode.node as SingleLineNode);
      }
    }

    const singleLineNode: SingleLineNode = {
      kind: 'single',
      items,
    };

    if (getSingleLineWidth(singleLineNode) <= WRAP_LIMIT) {
      return singleLineNode;
    }
  }

  // If we got here, we failed to make it a single-line, must go multi

  const rows: Array<MultiLineNodeRow> = [];

  for (const labeledNode of labeledNodes) {
    if (labeledNode.node) {
      if (labeledNode.node.kind === 'single') {
        const items: Array<string | SingleLineNode> = [];
        if (labeledNode.label) {
          items.push(labeledNode.label);
        }
        items.push(labeledNode.node);
        rows.push({indent: !labeledNode.label, item: {kind: 'single', items}});
      } else if (labeledNode.node.kind === 'multi') {
        if (labeledNode.label) {
          rows.push({indent: false, item: {kind: 'single', items: [labeledNode.label]}});
        }
        rows.push({indent: true, item: labeledNode.node});
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = labeledNode.node; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    } else {
      if (!labeledNode.label) {
        throw new Error('must have either label or node');
      }
      rows.push({indent: false, item: {kind: 'single', items: [labeledNode.label]}});
    }
  }

  return {
    kind: 'multi',
    rows,
  };
}

function maybeNameView(node: NameNode | undefined): SingleLineNode {
  return {
    kind: 'single',
    items: [node ? node.text : '?'],
  };
}

function streamReferenceView(node: StreamReferenceNode): SingleLineNode {
  return {kind: 'single', items: ['<streamref>']};
}

function streamExpressionView(node: StreamExpressionNode): EitherLineNode {
  switch (node.kind) {
    case NodeKind.UndefinedLiteral:
      return {kind: 'single', items: ['?']};

    case NodeKind.NumberLiteral:
      return {kind: 'single', items: [node.val.toString()]};

    case NodeKind.TextLiteral:
      return {kind: 'single', items: [node.val]};

    case NodeKind.BooleanLiteral:
      return {kind: 'single', items: [node.val.toString()]};

    case NodeKind.StreamReference:
      return streamReferenceView(node);

    case NodeKind.Application: {
      if (node.func.kind !== NodeKind.FunctionReference) {
        throw new Error('unimplemented');
      }
      const funcId = node.func.ref;

      if (funcId === 'bind') {
        // special case bind until we figure out a more general solution
        const nameNode = node.outs[0].name;
        if (!nameNode) {
          throw new Error();
        }

        const expr = streamExpressionView(node.sargs[0]);

        if (expr.kind === 'single') {
          const singleLineNode: SingleLineNode = {
            kind: 'single',
            items: [maybeNameView(nameNode), '=', expr],
          };

          if (getSingleLineWidth(singleLineNode) <= WRAP_LIMIT) {
            return singleLineNode;
          }
        }

        return {
          kind: 'multi',
          rows: [
            {
              indent: false,
              item: {
                kind: 'single',
                items: [maybeNameView(nameNode), '='],
              },
            },
            {
              indent: true,
              item: {
                kind: 'single',
                items: [expr as SingleLineNode],
              },
            },
          ],
        };
      } else {
        /*
        const [functionNode, displayedName] = getFunctionNodeAndDisplayName(node.func, ctxData.envLookups);

        if (functionNode.sig.streamParams.length !== node.sargs.length) {
          throw new Error('stream params and args length mismatch');
        }
        if (functionNode.sig.funcParams.length !== node.fargs.length) {
          throw new Error('function params and args length mismatch');
        }
        */

        const sargNodes = node.sargs.map(sarg => streamExpressionView(sarg));

        const labeledNodes: Array<LabeledNode> = [];

        labeledNodes.push({
          label: funcId,
        });

        for (const sargNode of sargNodes) {
          labeledNodes.push({
            node: sargNode,
          });
        }

        return labeledNodesView(labeledNodes);
      }
    }

    default: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
      throw new Error();
    }
  }
}

function treeFunctionBodyExprView(node: BodyExpressionNode): EitherLineNode {
  if (isStreamExpressionNode(node)) {
    return streamExpressionView(node);
  } else if (isFunctionExpressionNode(node)) {
    throw new Error('unimplemented');
  } else if (node.kind === NodeKind.YieldExpression) {
    throw new Error('unimplemented');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
    throw new Error('unreachable');
  }
}

function treeFunctionBodyView(node: TreeFunctionBodyNode): EitherLineNode {
  if (node.exprs.length === 0) {
    return {kind: 'single', items: ['nothing']};
  } else if (node.exprs.length === 1) {
    return treeFunctionBodyExprView(node.exprs[0]);
  } else {
    return {
      kind: 'multi',
      rows: node.exprs.map(expr => ({indent: false, item: treeFunctionBodyExprView(expr)})),
    };
  }
}

export function treeFunctionDefinitionView(node: TreeFunctionDefinitionNode): EitherLineNode {
  return labeledNodesView([
    {
      label: 'define',
      node: maybeNameView(node.name),
    },
    {
      label: 'as',
      node: treeFunctionBodyView(node.body),
    },
  ]);
}

export function renderAsPlainText(node: EitherLineNode, indent: number = 0): string {
  const INDENT_SPACES = 2;

  if (node.kind === 'single') {
    return ' '.repeat(INDENT_SPACES*indent) + node.items.map(item => (typeof item === 'string') ? item : renderAsPlainText(item)).join(' ');
  } else if (node.kind === 'multi') {
    return node.rows.map(row => renderAsPlainText(row.item, indent + (row.indent ? 1 : 0))).join('\n');
  } else {
    throw new Error();
  }
}
