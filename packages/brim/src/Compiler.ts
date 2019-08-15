import { State, StreamID, FunctionID, ExpressionNode, UserFunctionNode } from './State';

/*
Say we have the expression "display(add(time(), 10))". The call to display is an expression node, with streamId 'S1'. The call to add is an expression node with streamId 'S2'. The call to time is an expression node with streamId 'S3'. The literal 10 is a node with streamId 'S4'.

const compiledDefinition = {
  literalStreamValues: [
    ['S4', 10],
  ],
  applications: [
    ['S3', 'time', [], []],
    ['S2', 'add', ['S3', 'S4'], []],
    ['S1', 'display', ['S2'], []],
  ],
  containedDefinitions: [],
  yieldStream: null,
};
*/

export interface CompiledDefinition {
  literalStreamValues: Array<[StreamID, any]>;
  applications: Array<[StreamID, FunctionID, Array<StreamID>, Array<FunctionID>]>;
  containedDefinitions: Array<[FunctionID, CompiledDefinition]>;
  yieldStream: StreamID | null;
}

export class CompilationError extends Error {
};

function traverseFromExpression(expression: ExpressionNode, state: State, temporaryMarkedStreamIds: Set<StreamID>, permanentMarkedStreamIds: Set<StreamID>, compiledDefinition: CompiledDefinition) {
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
      compiledDefinition.applications.push([expression.streamId, 'Array_of', expression.items.map(item => item.streamId), []]);
      break;

    case 'StreamReference':
      const targetExpressionNode = state.derivedLookups!.streamIdToNode.get(expression.targetStreamId);
      if (!targetExpressionNode) {
        throw Error();
      }

      temporaryMarkedStreamIds.add(expression.streamId);
      traverseFromExpression(targetExpressionNode, state, temporaryMarkedStreamIds, permanentMarkedStreamIds, compiledDefinition);
      temporaryMarkedStreamIds.delete(expression.streamId);

      // For now, we do an inefficient copy rather than being smart
      compiledDefinition.applications.push([expression.streamId, 'id', [expression.targetStreamId], []]);
      break;

    case 'Application':
      const functionNode = state.derivedLookups!.functionIdToNode.get(expression.functionId);
      if (!functionNode) {
        throw Error();
      }

      temporaryMarkedStreamIds.add(expression.streamId);
      for (const argument of expression.arguments) {
        traverseFromExpression(argument, state, temporaryMarkedStreamIds, permanentMarkedStreamIds, compiledDefinition);
      }
      temporaryMarkedStreamIds.delete(expression.streamId);

      for (const functionArgument of expression.functionArguments) {
        // TODO: An application needs to traverse from its function-arguments out to any streams (in this exact scope)
        // that it refers to (outer-scope references), because these are dependencies. So this would be an invalid cycle:
        // x = map(v => x, [1,2,3])

        compiledDefinition.containedDefinitions.push([functionArgument.functionId, compileUserDefinition(functionArgument, state)]);
      }

      compiledDefinition.applications.push([expression.streamId, functionNode.functionId, expression.arguments.map(item => item.streamId), expression.functionArguments.map(item => item.functionId)]);
      break;

    default:
      throw new Error();
  }

  permanentMarkedStreamIds.add(expression.streamId);
}

export function compileUserDefinition(definition: UserFunctionNode, state: State): CompiledDefinition {
  // Using terminology from https://en.wikipedia.org/wiki/Topological_sorting#Depth-first_search
  const temporaryMarkedStreamIds: Set<StreamID> = new Set();
  const permanentMarkedStreamIds: Set<StreamID> = new Set();
  const compiledDefinition: CompiledDefinition = {
    literalStreamValues: [],
    applications: [],
    containedDefinitions: [],
    yieldStream: null,
  };

  for (const expression of definition.expressions) {
    traverseFromExpression(expression, state, temporaryMarkedStreamIds, permanentMarkedStreamIds, compiledDefinition);
    compiledDefinition.yieldStream = expression.streamId; // yield the last expression
  }

  return compiledDefinition;
}
