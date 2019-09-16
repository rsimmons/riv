import { Path, Node, isExpressionNode, isFunctionNode, UserFunctionNode, ParameterNode, ExpressionNode, pathIsPrefix } from './State';

type TraversalVisitor = (node: Node, path: Path) => [boolean, Node];

interface TraversalOptions {
  onlyLocal?: true; // do not traverse into contained function definitions
  alongPath?: Path;
}

// Returns [exit, newNode]. exit indicates an early end to traversal. newNode returns replacement node, which may be the same node
// Warning: This is a juicy-ass function that demands respect.
function recursiveTraverseTree(node: Node, path: Path, options: TraversalOptions, visit: TraversalVisitor): [boolean, Node] {
  if (options.alongPath && !pathIsPrefix(path, options.alongPath)) {
    return [false, node];
  }

  // Recurse
  let exited = false;
  let newNode: Node = node;

  if ((isExpressionNode(newNode) || isFunctionNode(newNode)) && newNode.identifier) {
    const [exit, newIdentifier] = recursiveTraverseTree(newNode.identifier, path.concat(['identifier']), options, visit);
    if (exit) exited = true;
    if (newIdentifier !== newNode.identifier) {
      newNode = {
        ...newNode,
        identifier: newIdentifier,
      } as Node;
    };
  }

  switch (newNode.type) {
    case 'Program': {
      const [exit, newMainDefinition] = recursiveTraverseTree(newNode.mainDefinition, path.concat(['mainDefinition']), options, visit);
      if (exit) exited = true;
      if (newMainDefinition !== newNode.mainDefinition) {
        newNode = {
          ...newNode,
          mainDefinition: newMainDefinition as UserFunctionNode,
        };
      }
      break;
    }

    case 'UserFunction': {
      const newParameters: Array<ParameterNode> = [];
      const newExpressions: Array<ExpressionNode> = [];
      let anyNewChildren = false;

      newNode.parameters.forEach((parameter, idx) => {
        if (exited) {
          newParameters.push(parameter);
        } else {
          const [exit, newParameter] = recursiveTraverseTree(parameter, path.concat(['parameters', idx]), options, visit);
          if (exit) exited = true;
          newParameters.push(newParameter as ParameterNode);
          if (newParameter !== parameter) anyNewChildren = true;
        }
      });

      newNode.expressions.forEach((expression, idx) => {
        if (exited) {
          newExpressions.push(expression);
        } else {
          const [exit, newExpression] = recursiveTraverseTree(expression, path.concat(['expressions', idx]), options, visit);
          if (exit) exited = true;
          newExpressions.push(newExpression as ExpressionNode);
          if (newExpression !== expression) anyNewChildren = true;
        }
      });

      if (anyNewChildren) {
        newNode = {
          ...newNode,
          parameters: newParameters,
          expressions: newExpressions,
        };
      }
      break;
    }

    case 'Application': {
      const newArguments: Array<ExpressionNode> = [];
      const newFunctionArguments: Array<UserFunctionNode> = [];
      let anyNewChildren = false;

      newNode.arguments.forEach((argument, idx) => {
        if (exited) {
          newArguments.push(argument);
        } else {
          const [exit, newArgument] = recursiveTraverseTree(argument, path.concat(['arguments', idx]), options, visit);
          if (exit) exited = true;
          newArguments.push(newArgument as ExpressionNode);
          if (newArgument !== argument) anyNewChildren = true;
        }
      });

      newNode.functionArguments.forEach((functionArgument, idx) => {
        if (exited || options.onlyLocal) {
          newFunctionArguments.push(functionArgument);
        } else {
          const [exit, newFunctionArgument] = recursiveTraverseTree(functionArgument, path.concat(['functionArguments', idx]), options, visit);
          if (exit) exited = true;
          newFunctionArguments.push(newFunctionArgument as UserFunctionNode);
          if (newFunctionArgument !== functionArgument) anyNewChildren = true;
        }
      });

      if (anyNewChildren) {
        newNode = {
          ...newNode,
          arguments: newArguments,
          functionArguments: newFunctionArguments,
        };
      }
      break;
    }

    case 'ArrayLiteral': {
      let newItems: Array<ExpressionNode> = [];
      let anyNewChildren = false;

      newNode.items.forEach((item, idx) => {
        if (exited) {
          newItems.push(item);
        } else {
          const [exit, newItem] = recursiveTraverseTree(item, path.concat(['items', idx]), options, visit);
          if (exit) exited = true;
          newItems.push(newItem as ExpressionNode);
          if (newItem !== item) anyNewChildren = true;
        }
      });

      if (anyNewChildren) {
        newNode = {
          ...newNode,
          items: newItems,
        };
      }
      break;
    }

    case 'Identifier':
    case 'IntegerLiteral':
    case 'StreamReference':
    case 'UndefinedExpression':
    case 'Parameter':
      // Nothing else to recurse into
      break;

    default:
      throw new Error();
  }

  if (exited) {
    return [exited, newNode];
  }

  return visit(newNode, path);
}

// Post-order traversal. Avoids returning new node unless something has changed.
export function traverseTree(node: Node, options: TraversalOptions, visit: TraversalVisitor): Node {
  const [, newNode] = recursiveTraverseTree(node, [], options, visit);
  return newNode;
}
