import { UID, Node, FunctionDefinitionNode, StreamExpressionNode, NodeKind, isStreamExpressionNode, FunctionInterfaceNode, BindingExpressionNode, NameBindingNode } from './Tree';
import { CompiledDefinition, ConstStreamSpec, AppSpec } from './CompiledDefinition';
import Environment from '../util/Environment';

export class CompilationError extends Error {
};

// Value of map is type, but we only do types of functions for now, which is just their interface
type CompilationEnvironment = Environment<UID, null | FunctionInterfaceNode>;

function compileTreeFuncDef(def: FunctionDefinitionNode, outerEnv: CompilationEnvironment): [CompiledDefinition, Set<UID>] {
  const impl = def.impl;
  if (impl.kind !== NodeKind.TreeImpl) {
    throw new Error();
  }

  // TODO: verify that pids match the interface?

  // Note that these don't include all local ids, but rather only
  // the ones that are at the "top level" and are valid to be referenced
  const localEnv: Map<UID, null | FunctionInterfaceNode> = new Map();

  // For local ids, what node "creates" them, i.e. that they depend on.
  // The keys are a subset of the localEnv keys, as they don't contain internal parameters
  const localCreator: Map<UID, NameBindingNode | FunctionDefinitionNode> = new Map();

  // These combined environments share the same local env objects,
  // so setting in local envs will affect these.
  const combinedEnv: CompilationEnvironment = new Environment(outerEnv, localEnv);

  // Add parameters to local environment, and extract internal parameter ids
  const pids: Array<UID> = [];
  def.iface.params.forEach(param => {
    const internalId = impl.pids.get(param.nid);
    if (!internalId) {
      throw new Error();
    }

    pids.push(internalId);

    localEnv.set(internalId, param.type);
  });

  // Iterate over stream bindings and top-level function definitions,
  // further building out the local environment.
  // We also build a map from BindingExpressionNodes to their parents.
  // NOTE: When we move to nested bindings, I think we might need the parent AND
  // the stream id that it outputs for that child? For StreamBindExpr it would be the RHS id.
  const bindingExprParent: Map<BindingExpressionNode, Node> = new Map();
  impl.body.forEach(bnode => {
    if (bnode.kind === NodeKind.StreamBinding) {
      // NOTE: When we have nested binding expressions (destructuring),
      // we will want to recursively traverse the LHS binding expression.
      localEnv.set(bnode.bexpr.nid, null);
      localCreator.set(bnode.bexpr.nid, bnode.bexpr);
      bindingExprParent.set(bnode.bexpr, bnode);
    } else if (bnode.kind === NodeKind.FunctionDefinition) {
      localEnv.set(bnode.nid, bnode.iface);
      localCreator.set(bnode.nid, bnode);
    }
    // top-level (unbound) stream expressions are ignored
  });

  // TOPOLOGICAL SORT
  // In the process of this sort, we compile to a dependency-ordered set of applications,
  // and also identify outer scope references, and compile any local tree function defs.
  // To "traverse to" an id or definition means to ensure that whatever is referred to by
  // that id/def has been added to the compiled output (this of course involves traversing
  // to any of _its dependencies).

  // Using terminology from https://en.wikipedia.org/wiki/Topological_sorting#Depth-first_search
  const temporaryMarked: Set<Node> = new Set();
  const permanentMarked: Set<Node> = new Set();

  const consts: Array<ConstStreamSpec> = [];
  const apps: Array<AppSpec> = [];
  const compiledSubdefs: Array<CompiledDefinition> = [];
  const outerReferencedIds: Set<UID> = new Set();

  const traverseToId = (id: UID): void => {
    if (localEnv.has(id)) {
      if (outerEnv.has(id)) {
        throw new Error();
      }
      const creator = localCreator.get(id);
      if (creator && (creator.kind === NodeKind.NameBinding)) {
        traverseToBindingExpr(creator);
      } else if (creator && (creator.kind === NodeKind.FunctionDefinition)) {
        traverseToStreamExpr(creator);
      }
    } else if (outerEnv.has(id)) {
      outerReferencedIds.add(id);
    } else {
      throw new Error();
    }
  };

  // Do what is needed to ensure this stream id defines all its "output" ids
  const traverseToBindingExpr = (bexpr: BindingExpressionNode): void => {
    if (permanentMarked.has(bexpr)) {
      return;
    }
    if (temporaryMarked.has(bexpr)) {
      throw new CompilationError('graph cycle');
    }

    // NOTE: This will get more complicated when we have nested binding expressions (destructuring)
    if (bexpr.kind === NodeKind.NameBinding) {
      const parent = bindingExprParent.get(bexpr);
      if (!parent || (parent.kind !== NodeKind.StreamBinding)) {
        throw new Error();
      }
      // parent must be a StreamBindingNode
      // ensure that the RHS of the stream binding is defined
      const rhsSid = traverseToStreamExpr(parent.sexpr);

      // Generate a copy: bexpr.nid <- rhsSid
      apps.push({
        aid: bexpr.nid,
        fid: '$copy',
        args: [rhsSid],
        oid: bexpr.nid,
      });
    } else {
      throw new Error();
    }

    temporaryMarked.delete(bexpr);
    permanentMarked.add(bexpr);
  };

  // returns the stream id of the expression
  function traverseToStreamExpr(node: StreamExpressionNode): UID {
    if (permanentMarked.has(node)) {
      return node.nid;
    }
    if (temporaryMarked.has(node)) {
      throw new CompilationError('graph cycle');
    }
    temporaryMarked.add(node);

    switch (node.kind) {
      case NodeKind.UndefinedLiteral:
        consts.push({sid: node.nid, val: undefined});
        break;

      case NodeKind.NumberLiteral:
      case NodeKind.TextLiteral:
      case NodeKind.BooleanLiteral:
        consts.push({sid: node.nid, val: node.val});
        break;

      case NodeKind.StreamReference:
        traverseToId(node.ref);

        // Emit a copy from the referenced id to this node's id
        apps.push({
          aid: node.nid,
          fid: '$copy',
          args: [node.ref],
          oid: node.nid,
        });
        break;

      case NodeKind.Application: {
        // Traverse to applied function id, as it is a dependency
        traverseToId(node.fid);

        const funcIface = combinedEnv.get(node.fid);
        if (!funcIface) {
          throw new CompilationError('applied func iface not found in env');
        }

        // TODO: make sure that sargs, fargs, yields all match signature

        // TODO: if the node has settings, add them to compiledArgs? and add to consts?

        // Traverse to all args, and build compiled args
        const compiledArgs: Array<UID | ReadonlyArray<UID>> = [];
        for (const param of funcIface.params) {
          const argNode = node.args.get(param.nid);
          if (!argNode) {
            throw new Error();
          }

          const sid = traverseToStreamExpr(argNode);
          compiledArgs.push(sid);
        }

        apps.push({
          aid: node.nid,
          fid: node.fid,
          args: compiledArgs,
          oid: funcIface.output ? node.nid : null,
        });
        break;
      }

      case NodeKind.FunctionDefinition: {
        if (node.impl.kind === NodeKind.NativeImpl) {
          // do nothing
        } else if (node.impl.kind === NodeKind.TreeImpl) {

          // Compile
          const [compiledSubdef, outerIdRefs] = compileTreeFuncDef(node, combinedEnv);
          compiledSubdefs.push(compiledSubdef);

          // Traverse to all dependencies (stream and function)
          for (const id of outerIdRefs) {
            traverseToId(id);
          }

        } else {
          throw new Error();
        }

        break;
      }

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }

    temporaryMarked.delete(node);
    permanentMarked.add(node);

    return node.nid;
  }

  // To kick off the topological sort, we traverse from all the "roots" in the function def
  for (const node of impl.body) {
    if (isStreamExpressionNode(node)) {
      traverseToStreamExpr(node);
    } else if (node.kind === NodeKind.StreamBinding) {
      // TODO: we also need to traverse the LHS, because all those streams may
      // be referenced by inner definitions even if we don't reference them locally.
      traverseToStreamExpr(node.sexpr);
    } else {
      throw new Error();
    }
  }
  if (impl.out) {
    traverseToStreamExpr(impl.out);
  }

  const compiledDefinition: CompiledDefinition = {
    fid: def.nid,
    pids,
    consts,
    apps,
    defs: compiledSubdefs,
    oid: impl.out ? impl.out.nid : null,
  };

  return [compiledDefinition, outerReferencedIds];
}

export function compileGlobalTreeDefinition(def: FunctionDefinitionNode, globalFunctionEnvironment: Environment<UID, FunctionDefinitionNode>): CompiledDefinition {
  const compGlobalEnv: CompilationEnvironment = new Environment();
  globalFunctionEnvironment.forEach((defNode, fid) => {
    compGlobalEnv.set(fid, defNode.iface);
  });

  const [compiledDefinition, /*outerReferencedIds*/] = compileTreeFuncDef(def, compGlobalEnv);

  return compiledDefinition;
}
