import { StreamID, FunctionID, ExpressionNode, FunctionNode, UserFunctionNode, isUserFunctionNode, isExpressionNode, isParameterNode } from './State';
import Environment from './Environment';
import { traverseTree } from './Traversal';

/*
Say we have the expression "display(add(time(), 10))". The call to display is an expression node, with streamId 'S1'. The call to add is an expression node with streamId 'S2'. The call to time is an expression node with streamId 'S3'. The literal 10 is a node with streamId 'S4'.

const compiledDefinition = {
  parameterStreams: [],
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
  parameterStreams: Array<StreamID>;
  // TODO: support function-parameters
  literalStreamValues: Array<[StreamID, any]>;
  applications: Array<[StreamID, FunctionID, Array<StreamID>, Array<FunctionID>]>;
  containedDefinitions: Array<[FunctionID, CompiledDefinition]>;
  yieldStream: StreamID | null;
  externalReferencedStreamIds: Set<StreamID>;
}

export class CompilationError extends Error {
};

interface TraversalContext {
  streamEnvironment: Environment<ExpressionNode>;
  functionEnvironment: Environment<FunctionNode>;
  localStreamIds: Set<StreamID>;
  localFunctionIds: Set<FunctionID>;
  temporaryMarkedStreamIds: Set<StreamID>;
  permanentMarkedStreamIds: Set<StreamID>;
  compiledDefinition: CompiledDefinition;
}

function traverseFromExpression(expression: ExpressionNode, context: TraversalContext): void {
  const {streamEnvironment, functionEnvironment, localStreamIds, temporaryMarkedStreamIds, permanentMarkedStreamIds, compiledDefinition} = context;

  if (permanentMarkedStreamIds.has(expression.streamId)) {
    return;
  }

  if (temporaryMarkedStreamIds.has(expression.streamId)) {
    throw new CompilationError('graph cycle');
  }


  switch (expression.type) {
    case 'Parameter':
      // Nothing to be done
      break;

      case 'UndefinedExpression':
      compiledDefinition.literalStreamValues.push([expression.streamId, undefined]);
      break;

    case 'IntegerLiteral':
      compiledDefinition.literalStreamValues.push([expression.streamId, expression.value]);
      break;

    case 'ArrayLiteral':
      temporaryMarkedStreamIds.add(expression.streamId);
      for (const item of expression.items) {
        traverseFromExpression(item, context);
      }
      temporaryMarkedStreamIds.delete(expression.streamId);

      // An array literal is handled as a function application, where the function is Array.of() which builds an array from its arguments.
      compiledDefinition.applications.push([expression.streamId, 'Array_of', expression.items.map(item => item.streamId), []]);
      break;

    case 'StreamReference':
      if (localStreamIds.has(expression.targetStreamId)) {
        const targetExpressionNode = streamEnvironment.get(expression.targetStreamId);
        if (!targetExpressionNode) {
          throw Error();
        }

        temporaryMarkedStreamIds.add(expression.streamId);
        traverseFromExpression(targetExpressionNode, context);
        temporaryMarkedStreamIds.delete(expression.streamId);
      } else {
        if (streamEnvironment.get(expression.targetStreamId) === undefined) {
          throw new Error();
        }
        compiledDefinition.externalReferencedStreamIds.add(expression.targetStreamId);
      }

      // For now, we do an inefficient copy rather than being smart
      compiledDefinition.applications.push([expression.streamId, 'id', [expression.targetStreamId], []]);
      break;

    case 'Application':
      const functionNode = functionEnvironment.get(expression.functionId);
      if (!functionNode) {
        throw Error();
      }

      temporaryMarkedStreamIds.add(expression.streamId);

      for (const argument of expression.arguments) {
        traverseFromExpression(argument, context);
      }

      for (const functionArgument of expression.functionArguments) {
        const compiledContainedDef = compileUserDefinition(functionArgument, streamEnvironment, functionEnvironment);

        compiledContainedDef.externalReferencedStreamIds.forEach((sid) => {
          compiledDefinition.externalReferencedStreamIds.add(sid);
        });

        // An application needs to traverse from its function-arguments out to any streams (in this exact scope)
        // that it refers to (outer-scope references), because these are dependencies. So this would be an invalid cycle:
        // x = map(v => x, [1,2,3])
        compiledContainedDef.externalReferencedStreamIds.forEach((sid) => {
          if (localStreamIds.has(sid)) {
            const depLocalExprNode = streamEnvironment.get(sid);
            if (depLocalExprNode === undefined) {
              throw new Error();
            }
            traverseFromExpression(depLocalExprNode, context);
          }
        });

        compiledDefinition.containedDefinitions.push([functionArgument.functionId, compiledContainedDef]);
      }

      temporaryMarkedStreamIds.delete(expression.streamId);

      compiledDefinition.applications.push([expression.streamId, functionNode.functionId, expression.arguments.map(item => item.streamId), expression.functionArguments.map(item => item.functionId)]);
      break;

    default:
      throw new Error();
  }

  permanentMarkedStreamIds.add(expression.streamId);
}

function compileUserDefinition(definition: UserFunctionNode, outerStreamEnvironment: Environment<ExpressionNode>, outerFunctionEnvironment: Environment<FunctionNode>): CompiledDefinition {
  const streamEnvironment: Environment<ExpressionNode> = new Environment(outerStreamEnvironment);
  const functionEnvironment: Environment<FunctionNode> = new Environment(outerFunctionEnvironment);
  const localStreamIds: Set<StreamID> = new Set();
  const localFunctionIds: Set<FunctionID> = new Set();

  // Traverse (just local scope) to find defined streams/functions
  traverseTree(definition, {onlyLocal: true}, (node, ) => {
    if (isExpressionNode(node) || isParameterNode(node)) {
      if (streamEnvironment.get(node.streamId) !== undefined) {
        throw new Error('must be unique');
      }
      streamEnvironment.set(node.streamId, node);
      localStreamIds.add(node.streamId);
    }

    if (isUserFunctionNode(node)) {
      if (functionEnvironment.get(node.functionId) !== undefined) {
        throw new Error('must be unique');
      }
      functionEnvironment.set(node.functionId, node);
      localFunctionIds.add(node.functionId);
    }

    return [false, node];
  });

  // Using terminology from https://en.wikipedia.org/wiki/Topological_sorting#Depth-first_search
  const temporaryMarkedStreamIds: Set<StreamID> = new Set();
  const permanentMarkedStreamIds: Set<StreamID> = new Set();
  const compiledDefinition: CompiledDefinition = {
    parameterStreams: definition.parameters.map(param => param.streamId),
    literalStreamValues: [],
    applications: [],
    containedDefinitions: [],
    yieldStream: null,
    externalReferencedStreamIds: new Set(),
  };

  for (const expression of definition.expressions) {
    traverseFromExpression(expression, {
      streamEnvironment,
      functionEnvironment,
      localStreamIds,
      localFunctionIds,
      temporaryMarkedStreamIds,
      permanentMarkedStreamIds,
      compiledDefinition,
    });
    compiledDefinition.yieldStream = expression.streamId; // yield the last expression
  }

  return compiledDefinition;
}

export function compileGlobalUserDefinition(definition: UserFunctionNode, globalFunctionEnvironment: Environment<FunctionNode>): CompiledDefinition {
  const streamEnvironment: Environment<ExpressionNode> = new Environment();
  const functionEnvironment: Environment<FunctionNode> = new Environment(globalFunctionEnvironment);

  return compileUserDefinition(definition, streamEnvironment, functionEnvironment);
}
