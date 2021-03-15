import { StreamID, FunctionID, Node, FunctionDefinitionNode, StreamExpressionNode, NodeKind, isStreamExpressionNode, TreeFunctionDefinitionNode, isFunctionDefinitionNode, FunctionInterfaceNode, ParameterID } from './Tree';
import { streamExprReturnedId } from './TreeUtil';
import { CompiledDefinition, ConstStreamSpec, LocalFunctionDefinition, AppSpec } from './CompiledDefinition';
import Environment from './Environment';
import { visitChildren } from './Traversal';

export class CompilationError extends Error {
};

// A stream id can be defined by either a stream expression or a parameter. If a stream id was
// created by a parameter, then it maps to null (because we don't need to traverse from the param).
type CompilationStreamEnvironment = Environment<StreamID, StreamExpressionNode | null>;
type CompilationFunctionEnvironment = Environment<FunctionID, FunctionInterfaceNode>;

function compileTreeFuncDef(def: TreeFunctionDefinitionNode, outerStreamEnvironment: CompilationStreamEnvironment, outerFunctionEnvironment: CompilationFunctionEnvironment): [CompiledDefinition, Set<StreamID>] {
  const streamEnvironment: CompilationStreamEnvironment = new Environment(outerStreamEnvironment);
  const functionEnvironment: CompilationFunctionEnvironment = new Environment(outerFunctionEnvironment);
  const localStreamIds: Set<StreamID> = new Set();
  const localFunctionMap: Map<FunctionID, FunctionDefinitionNode> = new Map();

  // TODO: verify that internal parameters (sparams, fparams) match the signature

  const addLocalStream = (sid: StreamID): void => {
    if (streamEnvironment.has(sid)) {
      throw new Error('must be unique');
    }
    streamEnvironment.set(sid, null);
    localStreamIds.add(sid);
  }

  // Identify locally defined stream and function ids
  def.iface.params.forEach(param => {
    switch (param.kind) {
      case NodeKind.FIStreamParam:
        addLocalStream(param.pid);
        break;

      case NodeKind.FIFunctionParam:
        // TODO: handle
        break;

      case NodeKind.FIOutParam:
        // nothing to do here
        break;

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = param; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }
  });

  const visitToFindLocals = (node: Node): void => {
    if (isStreamExpressionNode(node)) {
      switch (node.kind) {
        case NodeKind.UndefinedLiteral:
        case NodeKind.NumberLiteral:
        case NodeKind.TextLiteral:
        case NodeKind.BooleanLiteral:
          if (streamEnvironment.has(node.sid)) {
            console.log('node is', node);
            throw new Error('must be unique');
          }
          streamEnvironment.set(node.sid, node);
          localStreamIds.add(node.sid);
          break;

        case NodeKind.StreamReference:
          // ignore because it doesn't define a stream id
          break;

        case NodeKind.Application:
          if (node.rid !== undefined) {
            addLocalStream(node.rid);
          }
          node.args.forEach(arg => {
            if (arg.kind === NodeKind.ApplicationOut) {
              addLocalStream(arg.sid);
            }
          });
          break;

        default: {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
          throw new Error();
        }
      }
    } else if (isFunctionDefinitionNode(node)) {
      // A local definition
      if (functionEnvironment.has(node.fid)) {
        throw new Error('must be unique');
      }
      functionEnvironment.set(node.fid, node.iface);
      localFunctionMap.set(node.fid, node);
    }

    if (!isFunctionDefinitionNode(node)) {
      // Don't traverse into definitions, we want to stay local
      visitChildren(node, visitToFindLocals, undefined);
    }
  };
  visitChildren(def, visitToFindLocals, undefined);

  const constStreams: Array<ConstStreamSpec> = [];
  const apps: Array<AppSpec> = [];
  const localDefs: Array<LocalFunctionDefinition> = [];
  const externalReferencedStreamIds: Set<StreamID> = new Set();

  // Compile local tree function definitions
  for (const [fid, funcDef] of localFunctionMap.entries()) {
    if (funcDef.kind === NodeKind.TreeFunctionDefinition) {
      const [innerCompiledDef, ] = compileTreeFuncDef(funcDef, streamEnvironment, functionEnvironment);
      localDefs.push({fid, def: innerCompiledDef});
    } else {
      throw new Error();
    }
  }

  // Using terminology from https://en.wikipedia.org/wiki/Topological_sorting#Depth-first_search
  const temporaryMarked: Set<StreamExpressionNode> = new Set();
  const permanentMarked: Set<StreamExpressionNode> = new Set();

  function traverseStreamExpr(node: StreamExpressionNode): void {
    if (permanentMarked.has(node)) {
      return;
    }

    if (temporaryMarked.has(node)) {
      throw new CompilationError('graph cycle');
    }

    switch (node.kind) {
      case NodeKind.UndefinedLiteral:
        constStreams.push({sid: node.sid, val: undefined});
        break;

      case NodeKind.NumberLiteral:
      case NodeKind.TextLiteral:
      case NodeKind.BooleanLiteral:
        constStreams.push({sid: node.sid, val: node.val});
        break;

      case NodeKind.StreamReference:
        if (localStreamIds.has(node.ref)) {
          const targetExpressionNode = streamEnvironment.get(node.ref);
          if (targetExpressionNode === null) {
            // The reference is to a parameter, so we don't need to traverse
          } else if (targetExpressionNode === undefined) {
            throw Error();
          } else {
            temporaryMarked.add(node); // not really necessary to mark node here but might as well
            traverseStreamExpr(targetExpressionNode);
            temporaryMarked.delete(node);
          }
        } else {
          if (!streamEnvironment.has(node.ref)) {
            throw new CompilationError();
          }
          externalReferencedStreamIds.add(node.ref);
        }
        break;

      case NodeKind.Application: {
        const funcIface = functionEnvironment.get(node.fid);
        if (!funcIface) {
          throw new CompilationError();
        }

        // TODO: make sure that sargs, fargs, yields all match signature

        const compiledSids: Array<StreamID> = [];
        const compiledArgs: Array<ParameterID | ReadonlyArray<ParameterID>> = [];

        temporaryMarked.add(node);

        if (node.rid !== undefined) {
          compiledSids.push(node.rid);
        }

        for (const param of funcIface.params) {
          switch (param.kind) {
            case NodeKind.FIStreamParam: {
              const argNode = node.args.get(param.pid);
              if (!argNode || !isStreamExpressionNode(argNode)) {
                throw new Error();
              }
              traverseStreamExpr(argNode);
              const sid = streamExprReturnedId(argNode);
              if (!sid) {
                throw new Error();
              }
              compiledArgs.push(sid);
              break;
            }

            case NodeKind.FIFunctionParam: {
              /*
              const compiledContainedDef = compileTreeFuncImpl(funcDef, streamEnvironment, functionEnvironment);

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
                  traverseFromStreamCreation(depLocalExprNode, context);
                }
              });

              compiledDefinition.containedFunctionDefinitions.push({
                id: argument.id,
                definition: compiledContainedDef,
              });
              */

              const argNode = node.args.get(param.pid);
              if (!argNode || !isFunctionDefinitionNode(argNode)) {
                throw new Error();
              }
              compiledArgs.push(argNode.fid);
              break;
            }

            case NodeKind.FIOutParam: {
              const argNode = node.args.get(param.pid);
              if (!argNode || (argNode.kind !== NodeKind.ApplicationOut)) {
                throw new Error();
              }
              compiledSids.push(argNode.sid);
              break;
            }

            default: {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const exhaustive: never = param; // this will cause a type error if we haven't handled all cases
              throw new Error();
            }
          }
        }

        temporaryMarked.delete(node);

        apps.push({
          sids: compiledSids,
          appId: node.aid,
          funcId: node.fid,
          args: compiledArgs,
          settings: node.settings,
        });
        break;
      }

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = node; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }

    permanentMarked.add(node);
  }

  const yieldMap: Map<StreamID | null, StreamID> = new Map();

  for (const node of def.bodyExprs) {
    if (node.kind === NodeKind.YieldExpression) {
      traverseStreamExpr(node.expr);

      const exprRetSid = streamExprReturnedId(node.expr);
      if (!exprRetSid) {
        throw new Error();
      }
      yieldMap.set(node.out, exprRetSid);
    } else if (isStreamExpressionNode(node)) {
      traverseStreamExpr(node);
    } else if (isFunctionDefinitionNode(node)) {
      // don't need to traverse here?
    } else {
      throw new Error();
    }
  }

  const returnStreamIds: Array<StreamID> = [];

  if (def.iface.ret.kind === NodeKind.FIReturn) {
    const sid = yieldMap.get(null);
    if (!sid) {
      throw new Error();
    }
    returnStreamIds.push(sid);
  }

  const paramIds: Array<ParameterID> = [];
  for (const param of def.iface.params) {
    switch (param.kind) {
      case NodeKind.FIStreamParam:
        paramIds.push(param.pid);
        break;

      case NodeKind.FIFunctionParam:
        paramIds.push(param.pid);
        break;

      case NodeKind.FIOutParam: {
        const sid = yieldMap.get(param.pid);
        if (!sid) {
          throw new Error();
        }
        returnStreamIds.push(sid);
        break;
      }

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustive: never = param; // this will cause a type error if we haven't handled all cases
        throw new Error();
      }
    }
  }

  // TODO: verify that yieldIds doesn't have any "holes" and matches signature

  const compiledDefinition: CompiledDefinition = {
    paramIds,
    constStreams,
    apps,
    localDefs,
    returnStreamIds,
  };

  return [compiledDefinition, externalReferencedStreamIds];
}

export function compileGlobalTreeDefinition(def: TreeFunctionDefinitionNode, globalFunctionEnvironment: Environment<FunctionID, FunctionDefinitionNode>): CompiledDefinition {
  const streamEnv: CompilationStreamEnvironment = new Environment();

  const compGlobalFuncEnv: CompilationFunctionEnvironment = new Environment();
  globalFunctionEnvironment.forEach((defNode, fid) => {
    compGlobalFuncEnv.set(fid, defNode.iface);
  });
  const funcEnv: CompilationFunctionEnvironment = new Environment(compGlobalFuncEnv);

  const [compiledDefinition, externalReferencedStreamIds] = compileTreeFuncDef(def, streamEnv, funcEnv);

  if (externalReferencedStreamIds.size > 0) {
    throw new Error();
  }

  return compiledDefinition;
}
