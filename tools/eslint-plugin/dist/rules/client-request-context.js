/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

"use strict";

const { getParserServices } = require("./utils/parser");
const { AST_NODE_TYPES } = require("@typescript-eslint/experimental-utils");
const TSESTreeModule = require("@typescript-eslint/typescript-estree");
const { TSESTree } = require("@typescript-eslint/typescript-estree");

const OPTION_DONT_PROPAGATE = "dont-propagate-request-context";
const OPTION_CONTEXT_ARG_NAME = "context-arg-name";

const asyncFuncMoniker = "promise-returning function";

/** @typedef {import("@typescript-eslint/typescript-estree")} TSESTreeModule */
/** @typedef {TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration} FuncDeclLike */

/** Get the final element of an Array
 * @template T
 * @param {T[]} array
 * @returns {T | undefined}
 */
function back(array) {
  return array[array.length - 1];
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Follow the ClientRequestContext rules " +
        "(see https://www.itwinjs.org/learning/backend/managingclientrequestcontext/)",
      category: "TypeScript",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          [OPTION_DONT_PROPAGATE]: {
            type: "boolean",
            description:
              `normally non-node_module-imported ${asyncFuncMoniker}s are flagged if they do not receive ` +
              `the client request context as an argument, this diables that`,
            default: false,
          },
          [OPTION_CONTEXT_ARG_NAME]: {
            type: "string",
            description:
              `The name to use for adding an ClientRequestContext parameter when fixing. Defaults to 'clientRequestContext'`,
            default: "clientRequestContext",
          }
        },
      },
    ],
    fixable: "code",
    messages: {
      noContextParam: `All ${asyncFuncMoniker}s must take a parameter of type ClientRequestContext`,
      noReenterOnFirstLine: `All ${asyncFuncMoniker}s must call 'enter' on their ClientRequestContext immediately`,
      noReenterOnThenResume: `All ${asyncFuncMoniker}s must call 'enter' on their ClientRequestContext immediately in any 'then' callbacks`,
      // TODO: should probably do it after expressions, not statements but that might be more complicated...
      noReenterOnAwaitResume: `All ${asyncFuncMoniker}s must call 'enter' on their ClientRequestContext immediately after resuming from an awaited statement`,
      noReenterOnCatchResume: `All ${asyncFuncMoniker}s must call '{{reqCtxArgName}}.enter()' immediately after catching an async exception`,
      didntPropagate: `All ${asyncFuncMoniker}s must propagate their async to functions`,
      calledCurrent: `All ${asyncFuncMoniker}s must not call ClientRequestContext.current`,
    },
  },

  create(context) {
    const parserServices = getParserServices(context);
    const checker = parserServices.program.getTypeChecker();
    const extraOpts = context.options[0];
    const dontPropagate = extraOpts && extraOpts[OPTION_DONT_PROPAGATE] || false;
    const contextArgName = extraOpts && extraOpts[OPTION_CONTEXT_ARG_NAME] || "clientRequestContext";

    /**
     * @param {TSESTree.Node} node
     * @returns {FuncDeclLike}
     */
    function getOuterFunction(node) {
      /** @type {TSESTree.Node | undefined} */
      let cur = node;
      while (cur && !(cur.type === "FunctionExpression" || cur.type === "ArrowFunctionExpression" || cur.type === "FunctionDeclaration"))
        cur = cur.parent;
      return cur;
    }

    /**
     * @param {TSESTree.Expression} node
     * @returns {TSESTree.Statement | undefined}
     */
    function getExpressionOuterStatement(node) {
      /** @type {TSESTree.Node | undefined} */
      let cur = node;
      while (cur && !/Statement$/.test(cur.type))
        cur = cur.parent;
      return cur;
    }

    /**
    * @param {FuncDeclLike} node
    * @returns {boolean}
    */
    function returnsPromise(node) {
      const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
      if (!tsNode) return false;
      const signature = checker.getSignatureFromDeclaration(tsNode);
      if (!signature) return false;
      const returnType = signature && signature.getReturnType();
      if (!returnType) return false;
      return returnType.symbol && checker.getFullyQualifiedName(returnType.symbol) === "Promise";
    }

    /**
    * @param {TSESTree.Statement} node
    * @param {string} reqCtxArgName
    * @return {boolean}
    */
    function isClientRequestContextEnter(node, reqCtxArgName) {
      if (!node)
        return false;
      // until JSDoc supports `as const`, using explicit strings is easier
      // see: https://github.com/microsoft/TypeScript/issues/30445
      return (
        node &&
        node.type === AST_NODE_TYPES.ExpressionStatement &&
        node.expression.type === AST_NODE_TYPES.CallExpression &&
        node.expression.callee.type === AST_NODE_TYPES.MemberExpression &&
        node.expression.callee.object.type === AST_NODE_TYPES.Identifier &&
        node.expression.callee.object.name === reqCtxArgName &&
        node.expression.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.expression.callee.property.name === "enter"
      );
    }

    /**
     * @type {{
     *  func: FuncDeclLike,
     *  awaits: Set<TSESTree.AwaitExpression>,
     *  reqCtxArgName: string
     * }[]}
     */
    const asyncFuncStack = [];

    /**
     * @param {FuncDeclLike} node
     */
    function VisitFuncDeclLike(node) {
      if (!returnsPromise(node))
        return;

      /** @type {TSESTreeModule.TSESTreeToTSNode<TSESTree.FunctionExpression>} */
      const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);

      const clientReqCtx = node.params.find((p) => {
        const actualParam = p.type === AST_NODE_TYPES.TSParameterProperty ? p.parameter : p;
        const tsParam = parserServices.esTreeNodeToTSNodeMap.get(actualParam);
        const type = checker.getTypeAtLocation(tsParam);
        // TODO: should probably check the package name here too
        return type.symbol && /ClientRequestContext$/.test(checker.getFullyQualifiedName(type.symbol));
      });

      if (clientReqCtx === undefined) {
        context.report({
          node,
          messageId: "noContextParam",
          suggest: [
            {
              desc: "Add a ClientRequestContext parameter",
              fix(fixer) {
                const hasOtherParams = node.params.length > 0;
                return fixer.insertTextBeforeRange(
                  [tsNode.parameters.pos, tsNode.parameters.end],
                  `${contextArgName}: ClientRequestContext${hasOtherParams ? ", " : ""}`
                );
              }
            }
          ]
        });
        return;
      }

      const reqCtxArgName = clientReqCtx.name;

      asyncFuncStack.push({
        func: node,
        awaits: new Set(),
        reqCtxArgName,
      });

      if (node.body.type === "BlockStatement") {
        const firstStmt = node.body.body[0];
        if (!isClientRequestContextEnter(firstStmt, reqCtxArgName))
        context.report({
          node: firstStmt || node.body,
          messageId: "noReenterOnFirstLine",
          suggest: [{
              desc: `Add '${reqCtxArgName}.enter()' as the first statement of the body`,
              fix(fixer) {
                if (firstStmt)
                  return fixer.insertTextBefore(firstStmt, `${reqCtxArgName}.enter();`);
                else if (tsNode.body)
                  return fixer.insertTextBeforeRange(
                    // TODO: clarify why the tsNode locations are like this
                    [tsNode.body.end-1, tsNode.body.end],
                    `${reqCtxArgName}.enter();`
                  );
                return null;
              }
          }],
          data: { reqCtxArgName }
        });
      }
    }

    /** @param {TSESTree.FunctionExpression} node */
    function ExitFuncDeclLike(node) {
      const lastFunc = back(asyncFuncStack);
      if (!lastFunc || lastFunc.func !== node)
        return;
      asyncFuncStack.pop();
      for (const await_ of lastFunc.awaits) {
        const stmt = getExpressionOuterStatement(await_);
        // TODO: test + handle cases for expression bodies of arrow functions
        let body = stmt && stmt.parent &&
            ((stmt.parent.type === "FunctionExpression" && stmt.parent.body.body)
          || (stmt.parent.type === "TryStatement" && stmt.parent.block.body))
          || undefined;
        const stmtIndex = body.findIndex((s) => s === stmt);
        const nextStmt = stmt.parent.body[stmtIndex + 1];
        if (nextStmt && !isClientRequestContextEnter(nextStmt, lastFunc.reqCtxArgName)) {
          context.report({
            node: nextStmt,
            messageId: "noReenterOnAwaitResume",
            suggest: [
              {
                desc: `Add a call to '${lastFunc.reqCtxArgName}.enter()' after the statement containing 'await'`,
                fix(fixer) {
                  return fixer.insertTextAfter(
                    stmt,
                    `${lastFunc.reqCtxArgName}.enter();`
                  );
                }
              }
            ],
            data: {
              reqCtxArgName: lastFunc.reqCtxArgName
            }
          });
        }
      }
    };

    return {
      AwaitExpression(node) {
        const lastFunc = back(asyncFuncStack);
        // if the stack is empty, this is a top-level await and we can ignore it
        if (lastFunc) lastFunc.awaits.add(node);
      },

      CatchClause(node) {
        const outerFunc = getOuterFunction(node);
        const lastFunc = back(asyncFuncStack);
        if (lastFunc === undefined || lastFunc.func !== outerFunc)
          return;

        // TODO: abstract firstStmt check and fixer to reused function
        const firstStmt = node.body.body[0];
        if (!isClientRequestContextEnter(firstStmt, lastFunc.reqCtxArgName))
          context.report({
            node: firstStmt || node.body,
            messageId: "noReenterOnCatchResume",
            suggest: [{
                desc: `Add a call to '${lastFunc.reqCtxArgName}.enter()' as the first statement of the body`,
                fix(fixer) {
                  const bodyIsEmpty = firstStmt === undefined;
                  if (bodyIsEmpty) {
                    const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
                    return fixer.insertTextBeforeRange(
                      // TODO: clarify why the tsNode locations are like this
                      [tsNode.block.end-1, tsNode.block.end],
                      `${lastFunc.reqCtxArgName}.enter();`
                    );
                  }
                  return fixer.insertTextBefore(firstStmt, `${lastFunc.reqCtxArgName}.enter();`);
                }
            }],
            data: {
              reqCtxArgName: lastFunc.reqCtxArgName
            }
          });
      },

      CallExpression(node) {
        // TODO: need to check we aren't in a non-promise returning function nested in an async function...
        // get the outer function and compare to the top of the stack
        const outerFunc = getOuterFunction(node);
        const lastFunc = back(asyncFuncStack);
        if (lastFunc === undefined || lastFunc.func !== outerFunc)
          return;
        // TODO: use type checking to check for thenable's methods
        const isThen = (node.callee.name || node.callee.property.name || node.callee.property.value) === "then";
        const isCatch = (node.callee.name || node.callee.property.name || node.callee.property.value) === "catch";
        const isPromiseCallback = isThen || isCatch;
        if (isPromiseCallback) {
          const callback = node.arguments[0];
          if (callback.type === "FunctionExpression" || callback.type === "ArrowFunctionExpression") {
            // FIXME: deal with non-block body in async funcs...
            if (callback.body.type === "BlockStatement") {
              const firstStmt = callback.body.body[0];
              if (!isClientRequestContextEnter(firstStmt, lastFunc.reqCtxArgName))
              context.report({
                node: firstStmt || callback.body,
                messageId: isThen ? "noReenterOnThenResume" : "noReenterOnCatchResume",
                suggest: [{
                    desc: `Add a call to '${lastFunc.reqCtxArgName}.enter()' as the first statement of the body`,
                    fix(fixer) {
                      const bodyIsEmpty = firstStmt === undefined;
                      if (bodyIsEmpty) {
                        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
                        return fixer.insertTextBeforeRange(
                          // TODO: clarify why the tsNode locations are like this
                          [tsNode.body.end-1, tsNode.body.end],
                          `${lastFunc.reqCtxArgName}.enter();`
                        );
                      }
                      return fixer.insertTextBefore(firstStmt, `${lastFunc.reqCtxArgName}.enter();`);
                    }
                }],
                data: {
                  reqCtxArgName: lastFunc.reqCtxArgName
                }
              });
            }
          }
        }
      },


      "ArrowFunctionExpression:exit": ExitFuncDeclLike,
      "FunctionDeclaration:exit": ExitFuncDeclLike,
      "FunctionExpression:exit": ExitFuncDeclLike,
      ArrowFunctionExpression: VisitFuncDeclLike,
      FunctionDeclaration: VisitFuncDeclLike,
      FunctionExpression: VisitFuncDeclLike,
    };
  },
};

module.exports = rule;
