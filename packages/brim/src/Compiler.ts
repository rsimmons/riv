import { StateWithLookups, StreamID, ExpressionNode } from './State';

/*
Say we have the expression "display(add(time(), 10))". The call to display is an expression node, with streamId 'S1'. The call to add is an expression node with streamId 'S2'. The call to time is an expression node with streamId 'S3'. The literal 10 is a node with streamId 'S4'.

const compiledDefinition = {
  literalStreamValues: [
    ['S4', 10],
  ],
  applications: [
    ['S3', time, []],
    ['S2', add, ['S3', 'S4']],
    ['S1', display, ['S2']],
  ]
};
*/

interface CompiledDefinition {
  literalStreamValues: Array<[StreamID, any]>;
  applications: Array<[StreamID, Function, Array<StreamID>]>;
}

export class CompilationError extends Error {
};

function traverseFromExpression(expression: ExpressionNode, state: StateWithLookups, temporaryMarkedStreamIds: Set<StreamID>, permanentMarkedStreamIds: Set<StreamID>, compiledDefinition: CompiledDefinition) {
  if (permanentMarkedStreamIds.has(expression.streamId)) {
    return;
  }

  if (temporaryMarkedStreamIds.has(expression.streamId)) {
    throw new CompilationError('graph cycle');
  }


  switch (expression.type) {
    case 'UndefinedExpression':
      compiledDefinition.literalStreamValues.push([expression.streamId, undefined]);
      break;

    case 'IntegerLiteral':
      compiledDefinition.literalStreamValues.push([expression.streamId, expression.value]);
      break;

    case 'ArrayLiteral':
      temporaryMarkedStreamIds.add(expression.streamId);
      for (const item of expression.items) {
        traverseFromExpression(item, state, temporaryMarkedStreamIds, permanentMarkedStreamIds, compiledDefinition);
      }
      temporaryMarkedStreamIds.delete(expression.streamId);

      // An array literal is handled as a function application, where the function is Array.of() which builds an array from its arguments.
      compiledDefinition.applications.push([expression.streamId, Array.of, expression.items.map((item: ExpressionNode) => item.streamId)]);
      break;

    case 'StreamReference':
      const targetExpressionNode = state.streamIdToNode.get(expression.targetStreamId);
      if (!targetExpressionNode) {
        throw Error();
      }

      temporaryMarkedStreamIds.add(expression.streamId);
      traverseFromExpression(targetExpressionNode, state, temporaryMarkedStreamIds, permanentMarkedStreamIds, compiledDefinition);
      temporaryMarkedStreamIds.delete(expression.streamId);
      break;

    case 'Application':
      const functionNode = state.functionIdToNode.get(expression.functionId);
      if (!functionNode) {
        throw Error();
      }

      temporaryMarkedStreamIds.add(expression.streamId);
      for (const argument of expression.arguments) {
        traverseFromExpression(argument, state, temporaryMarkedStreamIds, permanentMarkedStreamIds, compiledDefinition);
      }
      temporaryMarkedStreamIds.delete(expression.streamId);

      compiledDefinition.applications.push([expression.streamId, functionNode.jsFunction, expression.arguments.map((item: ExpressionNode) => item.streamId)]);
      break;

    default:
      throw new Error();
  }

  permanentMarkedStreamIds.add(expression.streamId);
}

export function compileExpressions(expressions: Array<ExpressionNode>, state: StateWithLookups): CompiledDefinition {
  // Using terminology from https://en.wikipedia.org/wiki/Topological_sorting#Depth-first_search
  const temporaryMarkedStreamIds: Set<StreamID> = new Set();
  const permanentMarkedStreamIds: Set<StreamID> = new Set();
  const compiledDefinition = {
    literalStreamValues: [],
    applications: [],
  };

  for (const expression of expressions) {
    traverseFromExpression(expression, state, temporaryMarkedStreamIds, permanentMarkedStreamIds, compiledDefinition);
  }

  return compiledDefinition;
}
