import { RivFunctionDefinition, StreamDefinition, FunctionDefinition } from './newEssentialDefinition';
import { RivFunctionDefinitionNode, StreamParameterNode, FunctionParameterNode, StreamExpressionNode } from './Tree';
import { StreamID, FunctionID } from './Identifier';

export function recursiveTreeFromEssential(definition: RivFunctionDefinition, streamIdToDef: Map<StreamID, StreamDefinition>, functionIdToDef: Map<FunctionID, FunctionDefinition>): RivFunctionDefinitionNode {
  const streamParameters: ReadonlyArray<StreamParameterNode> = definition.signature.streamParameters.map(param => ({
    type: 'StreamParameter',
    children: [],
    selectionIds: [],
    parameter: param,
  }));

  const functionParameters: ReadonlyArray<FunctionParameterNode> = definition.signature.functionParameters.map(param => ({
    type: 'FunctionParameter',
    children: [],
    selectionIds: [],
    parameter: param,
  }));

  const streamIdReferenceCount: Map<StreamID, number> = new Map();
  const incStreamRefCount = (sid: StreamID) => {
    if (!streamIdReferenceCount.has(sid)) {
      streamIdReferenceCount.set(sid, 0);
    }
    streamIdReferenceCount.set(sid, streamIdReferenceCount.get(sid)!+1);
  };

  for (const sdef of definition.streamDefinitions) {
    switch (sdef.type) {
      case 'und':
      case 'num':
      case 'param':
        // does not reference any stream ids
        break;

      case 'arr':
        for (const sid of sdef.itemIds) {
          incStreamRefCount(sid);
        }
        break;

      case 'app':
        for (const sid of sdef.streamArgumentIds) {
          incStreamRefCount(sid);
        }
        break;

      default:
        throw new Error();
    }
  }

  const streamIdIsRootExpr: Map<StreamID, boolean> = new Map();
  for (const sdef of definition.streamDefinitions) {
    const count = streamIdReferenceCount.get(sdef.id) || 0;
    const isRoot = (count !== 1);
    streamIdIsRootExpr.set(sdef.id, isRoot);
  }

  const localStreamIdToDef: Map<StreamID, StreamDefinition> = new Map();
  for (const sdef of definition.streamDefinitions) {
    streamIdToDef.set(sdef.id, sdef);
    localStreamIdToDef.set(sdef.id, sdef);
  }

  const assertDefined = <T>(v: T | undefined): T => {
    if (v === undefined) {
      throw new Error();
    }
    return v;
  };

  const recursiveBuildStreamExpression = (sdef: StreamDefinition, parent: StreamDefinition | null): StreamExpressionNode => {
    const isRoot = streamIdIsRootExpr.get(sdef.id);
    if (isRoot === undefined) {
      throw new Error();
    }

    if (!parent && !isRoot) {
      throw new Error(); // sanity check
    }
    if ((isRoot && parent) || !localStreamIdToDef.has(sdef.id)) {
      return {
        type: 'StreamReference',
        children: [],
        selectionIds: [],
        targetDefinition: sdef,
      };
    }

    switch (sdef.type) {
      case 'und':
      case 'num':
        return {
          type: 'SimpleStreamDefinition',
          children: [],
          selectionIds: [],
          definition: sdef,
        };

      case 'arr':
        return {
          type: 'SimpleStreamDefinition',
          children: sdef.itemIds.map(itemId => recursiveBuildStreamExpression(assertDefined(streamIdToDef.get(itemId)), sdef)),
          selectionIds: [],
          definition: sdef,
        };

      case 'app':
        return {
          type: 'Application',
          // TODO: we also need function arguments
          children: sdef.streamArgumentIds.map(argId => recursiveBuildStreamExpression(assertDefined(streamIdToDef.get(argId)), sdef)),
          selectionIds: [],
          definition: sdef,
          appliedFunctionDefinition: assertDefined(functionIdToDef.get(sdef.appliedFunctionId)),
        };

      default:
        throw new Error();
    }
  };

  const expressions: Array<StreamExpressionNode> = [];

  for (const sdef of definition.streamDefinitions) {
    const isRoot = streamIdIsRootExpr.get(sdef.id);
    if (isRoot === undefined) {
      throw new Error();
    }

    if (isRoot) {
      const expression = recursiveBuildStreamExpression(sdef, null);
      expressions.push(expression);
    }
  }

  return {
    type: 'RivFunctionDefinition',
    children: [
      {
        type: 'RivFunctionDefinitionStreamParameters',
        children: streamParameters,
        selectionIds: [],
      },
      {
        type: 'RivFunctionDefinitionStreamExpressions',
        children: expressions,
        selectionIds: [],
      },
    ],
    selectionIds: [],
    definition: definition,
  };
}

export function treeFromEssential(definition: RivFunctionDefinition, globalFunctions: Map<FunctionID, FunctionDefinition>): RivFunctionDefinitionNode {
  const streamIdToDef: Map<StreamID, StreamDefinition> = new Map();
  const functionIdToDef: Map<FunctionID, FunctionDefinition> = new Map(globalFunctions);
  return recursiveTreeFromEssential(definition, streamIdToDef, functionIdToDef);
}
