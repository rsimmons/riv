import { StreamID, FunctionID, AnyID } from './Identifier';
import { UserFunctionDefinitionNode, StreamExpressionNode, StreamDefinitionNode, FunctionDefinitionNode, isStreamDefinitionNode, isUserFunctionDefinitionNode, isStreamExpressionNode } from './Tree';
import { EssentialDefinition } from './EssentialDefinition';
import Environment from './Environment';
import { traverseTree } from './Traversal';

export class CompilationError extends Error {
};

interface TraversalContext {
  streamEnvironment: Environment<StreamDefinitionNode>;
  functionEnvironment: Environment<FunctionDefinitionNode>;
  localStreamIds: Set<StreamID>;
  localFunctionIds: Set<FunctionID>;
  temporaryMarkedStreamIds: Set<StreamID>;
  permanentMarkedStreamIds: Set<StreamID>;
  essentialDefinition: EssentialDefinition;
}

function traverseFromStreamDefinition(node: StreamDefinitionNode, context: TraversalContext): void {
  const {streamEnvironment, functionEnvironment, localStreamIds, temporaryMarkedStreamIds, permanentMarkedStreamIds, essentialDefinition} = context;

  if (permanentMarkedStreamIds.has(node.id)) {
    return;
  }

  if (temporaryMarkedStreamIds.has(node.id)) {
    throw new CompilationError('graph cycle');
  }

  switch (node.type) {
    case 'UndefinedLiteral':
      essentialDefinition.constantStreamValues.push({streamId: node.id, value: undefined});
      break;

    case 'NumberLiteral':
        essentialDefinition.constantStreamValues.push({streamId: node.id, value: node.value});
        break;

    case 'ArrayLiteral':
      const itemStreamIds: Array<StreamID> = [];

      temporaryMarkedStreamIds.add(node.id);
      for (const item of node.children) {
        itemStreamIds.push(traverseFromStreamExpression(item, context));
      }
      temporaryMarkedStreamIds.delete(node.id);

      // An array literal is handled as a function application, where the function is Array.of() which builds an array from its arguments.
      essentialDefinition.applications.push({
        resultStreamId: node.id,
        appliedFunction: 'Array_of',
        argumentIds: itemStreamIds,
      });
      break;

    case 'Application':
      /*
      const functionNode = functionEnvironment.get(node.functionId);
      if (!functionNode) {
        throw Error();
      }
      */

      const argumentIds: Array<AnyID> = [];

      temporaryMarkedStreamIds.add(node.id);

      for (const argument of node.children) {
        if (isStreamExpressionNode(argument)) {
          argumentIds.push(traverseFromStreamExpression(argument, context));
        } else if (isUserFunctionDefinitionNode(argument)) {
          const compiledContainedDef = compileUserDefinition(argument, streamEnvironment, functionEnvironment);

          compiledContainedDef.externalReferencedStreamIds.forEach((sid) => {
            essentialDefinition.externalReferencedStreamIds.add(sid);
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
              traverseFromStreamDefinition(depLocalExprNode, context);
            }
          });

          essentialDefinition.containedFunctionDefinitions.push({
            id: argument.id,
            definition: compiledContainedDef,
          });

          argumentIds.push(argument.id);
        } else {
          // TODO: There are legitimate unhandled cases
          throw new Error();
        }
      }

      temporaryMarkedStreamIds.delete(node.id);

      essentialDefinition.applications.push({
        resultStreamId: node.id,
        appliedFunction: node.functionId,
        argumentIds,
      });
      break;

    default:
      throw new Error();
  }

  permanentMarkedStreamIds.add(node.id);
}

function traverseFromStreamExpression(node: StreamExpressionNode, context: TraversalContext): StreamID {
  const {streamEnvironment, localStreamIds, essentialDefinition} = context;

  if (node.type === 'StreamReference') {
    if (localStreamIds.has(node.targetStreamId)) {
      const targetExpressionNode = streamEnvironment.get(node.targetStreamId);
      if (!targetExpressionNode) {
        throw Error();
      }

      traverseFromStreamDefinition(targetExpressionNode, context);
    } else {
      if (streamEnvironment.get(node.targetStreamId) === undefined) {
        throw new Error();
      }
      essentialDefinition.externalReferencedStreamIds.add(node.targetStreamId);
    }

    return node.targetStreamId;
  } else {
    traverseFromStreamDefinition(node, context);

    return node.id;
  }
}

function compileUserDefinition(definition: UserFunctionDefinitionNode, outerStreamEnvironment: Environment<StreamDefinitionNode>, outerFunctionEnvironment: Environment<FunctionDefinitionNode>): EssentialDefinition {
  const streamEnvironment: Environment<StreamDefinitionNode> = new Environment(outerStreamEnvironment);
  const functionEnvironment: Environment<FunctionDefinitionNode> = new Environment(outerFunctionEnvironment);
  const localStreamIds: Set<StreamID> = new Set();
  const localFunctionIds: Set<FunctionID> = new Set();

  // Traverse (just local scope) to find defined streams/functions
  traverseTree(definition, {onlyLocal: true}, (node, ) => {
    if (isStreamDefinitionNode(node)) {
      if (streamEnvironment.get(node.id) !== undefined) {
        throw new Error('must be unique');
      }
      streamEnvironment.set(node.id, node);
      localStreamIds.add(node.id);
    }

    if (isUserFunctionDefinitionNode(node)) {
      if (functionEnvironment.get(node.id) !== undefined) {
        throw new Error('must be unique');
      }
      functionEnvironment.set(node.id, node);
      localFunctionIds.add(node.id);
    }

    return [false, node];
  });

  // Using terminology from https://en.wikipedia.org/wiki/Topological_sorting#Depth-first_search
  const temporaryMarkedStreamIds: Set<StreamID> = new Set();
  const permanentMarkedStreamIds: Set<StreamID> = new Set();
  const essentialDefinition: EssentialDefinition = {
    parameters: definition.children[0].children.map(param => ({id: param.id})),
    constantStreamValues: [],
    applications: [],
    containedFunctionDefinitions: [],
    yieldStreamId: null,
    externalReferencedStreamIds: new Set(),
    externalReferencedFunctionIds: new Set(),
  };

  for (const expr of definition.children[1].children) {
    if (isStreamExpressionNode(expr)) {
      const sid = traverseFromStreamExpression(expr, {
        streamEnvironment,
        functionEnvironment,
        localStreamIds,
        localFunctionIds,
        temporaryMarkedStreamIds,
        permanentMarkedStreamIds,
        essentialDefinition,
      });
      essentialDefinition.yieldStreamId = sid; // yield the last stream expression
    }
  }

  return essentialDefinition;
}

export function compileGlobalUserDefinition(definition: UserFunctionDefinitionNode, globalFunctionEnvironment: Environment<FunctionDefinitionNode>): EssentialDefinition {
  const streamEnvironment: Environment<StreamDefinitionNode> = new Environment();
  const functionEnvironment: Environment<FunctionDefinitionNode> = new Environment(globalFunctionEnvironment);

  return compileUserDefinition(definition, streamEnvironment, functionEnvironment);
}
