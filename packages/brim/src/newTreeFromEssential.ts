import { RivFunctionDefinition, StreamDefinition, FunctionDefinition } from './newEssentialDefinition';
import { Node, RivFunctionDefinitionNode, StreamParameterNode, FunctionParameterNode, StreamExpressionNode, SimpleStreamDefinitionNode, ApplicationNode } from './Tree';
import { StreamID, FunctionID } from './Identifier';

function postorderTraverseTree(node: Node, visit: (node: Node) => void): void {
  for (const child of node.children) {
    postorderTraverseTree(child, visit);
  }

  visit(node);
}

export function recursiveTreeFromEssential(definition: RivFunctionDefinition, streamIdToDef: Map<StreamID, StreamDefinition>, functionIdToDef: Map<FunctionID, FunctionDefinition>): RivFunctionDefinitionNode {
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

  const recursiveBuildStreamExpression = (sdef: StreamDefinition, parent: Node | null): StreamExpressionNode => {
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
        selected: false,
        selectionIds: [],
        parent,
        targetDefinition: sdef,
      };
    }

    switch (sdef.type) {
      case 'und':
      case 'num':
        return {
          type: 'SimpleStreamDefinition',
          children: [],
          selected: false,
          selectionIds: [sdef.id],
          parent,
          definition: sdef,
        };

      case 'arr': {
        const node: SimpleStreamDefinitionNode = {
          type: 'SimpleStreamDefinition',
          children: [],
          selected: false,
          selectionIds: [sdef.id],
          parent,
          definition: sdef,
        };

        node.children = sdef.itemIds.map(itemId => recursiveBuildStreamExpression(assertDefined(streamIdToDef.get(itemId)), node));

        return node;
      }

      case 'app': {
        const node: ApplicationNode = {
          type: 'Application',
          // TODO: we also need function arguments
          children: [],
          selected: false,
          selectionIds: [sdef.id],
          definition: sdef,
          parent,
          appliedFunctionDefinition: assertDefined(functionIdToDef.get(sdef.appliedFunctionId)),
        };

        node.children = sdef.streamArgumentIds.map(argId => recursiveBuildStreamExpression(assertDefined(streamIdToDef.get(argId)), node));

        return node;
      }

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

  const streamParameters: ReadonlyArray<StreamParameterNode> = definition.signature.streamParameters.map(param => ({
    type: 'StreamParameter',
    children: [],
    selected: false,
    selectionIds: [],
    parent: null,
    parameter: param,
  }));

  const functionParameters: ReadonlyArray<FunctionParameterNode> = definition.signature.functionParameters.map(param => ({
    type: 'FunctionParameter',
    children: [],
    selected: false,
    selectionIds: [],
    parent: null,
    parameter: param,
  }));

  const definitionNode: RivFunctionDefinitionNode = {
    type: 'RivFunctionDefinition',
    children: [
      {
        type: 'RivFunctionDefinitionStreamParameters',
        children: streamParameters,
        selected: false,
        selectionIds: [],
        parent: null,
      },
      {
        type: 'RivFunctionDefinitionStreamExpressions',
        children: expressions,
        selected: false,
        selectionIds: [],
        parent: null,
      },
    ],
    selected: false,
    selectionIds: [definition.id],
    parent: null, // TODO: set
    definition: definition,
  };

  definitionNode.children[0].parent = definitionNode;
  definitionNode.children[1].parent = definitionNode;

  for (const param of definitionNode.children[0].children) {
    param.parent = definitionNode.children[0];
  }
  // TODO: do for function-parameters when we add them

  for (const expr of definitionNode.children[1].children) {
    expr.parent = definitionNode.children[1];
  }

  return definitionNode;
}

export function treeFromEssential(definition: RivFunctionDefinition, globalFunctions: Map<FunctionID, FunctionDefinition>, selectionIds: ReadonlyArray<string>): [RivFunctionDefinitionNode, Node | null] {
  const streamIdToDef: Map<StreamID, StreamDefinition> = new Map();
  const functionIdToDef: Map<FunctionID, FunctionDefinition> = new Map(globalFunctions);
  const tree = recursiveTreeFromEssential(definition, streamIdToDef, functionIdToDef);

  let selectedNode: Node | null = null;
  for (const selId of selectionIds) {
    if (selectedNode) {
      continue;
    }
    postorderTraverseTree(tree, node => {
      if (node.selectionIds.includes(selId)) {
        if (!selectedNode) {
          node.selected = true;
          selectedNode = node;
        }
      }
    });
  }

  return [tree, selectedNode];
}
