import React from 'react';
import logo from './logo.svg';
import './App.css';
import { notStrictEqual } from 'assert';


function unreachable(e: never): never {
  throw new Error("unreachable");
}

interface FUN {
  kind: "FUN",
  arguments: Var[],
  expression: Expression,
}

interface CON {
  kind: "CON",
  tag: "Nil" | "Cons" | "I"; // lists and ints
  payload: any[],
}

interface PAP {
  kind: "PAP",
  f: Var,
  arguments: Var[],
}

interface THUNK {
  kind: "THUNK",
  expression: Expression,
}

interface BLACKHOLE {
  kind: "BLACKHOLE",
}

interface FunctionCall {
  kind: "FunctionCall",
  f: Var, // lookup on heap
  arguments: Var[], // lookup on heap
}

interface Case {
  kind: "Case",
  expression: Expression,
  alternatives: Alternative[],
}

interface Alternative {
  kind: "Alternative",
  tag: "Cons" | "Nil" | "I",
  bindingName: Var[],
  expression: Expression,
}

interface Let {
  kind: "Let",
  newObject: HeapObject,
  name: string,
  in: Expression,
}
interface PrimPlus {
  kind: "PrimPlus",
  a1: number,
  a2: number,
}
interface Var {
  kind: "Var",
  name: string,
}

interface CaseCont {
  kind: "CaseCont",
  alternatives: Alternative[],
}
interface UpdateCont {
  kind: "UpdateCont",
  var: Var,
}
interface ApplyToArgs {
  kind: "ApplyToArgs",
  arguments: Var[],
}

const mkVar = (name: string): Var => ({ kind: "Var", name });

let varCounter = 0;
const freshVar = (): Var => {
  return { kind: "Var", name: `$${varCounter++}` }
}

export type HeapObject = FUN | CON | PAP | THUNK | BLACKHOLE;
export type Expression = FunctionCall | Case | Let | PrimPlus | Var;
export type Continuation = CaseCont | UpdateCont | ApplyToArgs;

const stack: Continuation[] = [];

export const heap: Record<string, HeapObject> = {
  nil: { kind: "CON", tag: "Nil", payload: [] },
  zero: { kind: "CON", tag: "I", payload: [0] },
  one: { kind: "CON", tag: "I", payload: [1] },
  two: { kind: "CON", tag: "I", payload: [2] },
  three: { kind: "CON", tag: "I", payload: [3] },

  plusInt: {
    kind: "FUN", arguments: [mkVar("x"), mkVar("y")], expression: {
      kind: "Case", expression: mkVar("x"),
      alternatives: [{
        kind: "Alternative", tag: "I", bindingName: [mkVar("i")], expression: {
          kind: "Case", expression: mkVar("x"),
          alternatives: [{
            kind: "Alternative", tag: "I", bindingName: [mkVar("j")], expression: {
              kind: "Let", name: "x",
              newObject: { kind: "CON", tag: "I", payload: [{ kind: "PrimPlus", a1: 1, a2: 2 }] },
              in: mkVar("x"),
            }
          }]
        }
      }]
    }
  },
  foldl: {
    kind: "FUN", arguments: [mkVar("f"), mkVar("acc"), mkVar("list")], expression: {
      kind: "Case", expression: mkVar("list"),
      alternatives: [
        { kind: "Alternative", tag: "Nil", bindingName: [mkVar("_")], expression: mkVar("acc") },
        {
          kind: "Alternative", tag: "Cons", bindingName: [mkVar("h"), mkVar("t")], expression: {
            kind: "Let", name: "newAcc", newObject: {
              kind: "THUNK", expression: {
                kind: "FunctionCall", f: mkVar("f"),
                arguments: [mkVar("acc"), mkVar("h")]
              },
            }, in: {
              kind: "FunctionCall", f: mkVar("foldl"), arguments: [mkVar("f"), mkVar("newAcc"), mkVar("t")],
            }
          },
        },
      ]
    }
  },
  // # lazy sum with a well-known space leak
  sum: {
    kind: "FUN", arguments: [mkVar("list")], expression: {
      kind: "FunctionCall", f: mkVar("foldl"), arguments: [mkVar("plusInt"), mkVar("zero"), mkVar("list")],
    }
  },
  list1: { kind: "CON", tag: "Cons", payload: ["one", "nil"] },
  list2: { kind: "CON", tag: "Cons", payload: ["two", "list1"] },
  list3: { kind: "CON", tag: "Cons", payload: ["three", "list2"] },
  main: {
    kind: "THUNK", expression: { kind: "FunctionCall", f: mkVar("sum"), arguments: [mkVar("list3")] },
  }
}

const isValue = (v: Var) => {
  // Section 3.1:
  // "Of these, FUN , PAP and CON objects are values, and cannot be evaluated any
  // further."
  return ["FUN", "PAP", "CON"].includes(heap[v.name].kind);
}


export const substitute = (e: Expression, oldName: string, newName: string): Expression => {
  const substituteVar = (v: Var) => v.name == oldName ? mkVar(newName) : v;

  const substituteObject = (obj: HeapObject): HeapObject => {
    switch (obj.kind) {
      case "THUNK": {
        return { kind: "THUNK", expression: substitute(obj.expression, oldName, newName)}
      }
      case "CON": {
        return { kind: "CON", tag: obj.tag, payload: obj.payload.map(x => substituteObject(x))}
      }
    }
    return obj;
  };

  switch (e.kind) {
    case "FunctionCall": {
      return {
        kind: e.kind,
        f: substituteVar(e.f),
        arguments: e.arguments.map(substituteVar)
      }
    }
    case "Case": {
      // need to walk all Alt branches
      return {
        kind: e.kind,
        expression: substitute(e.expression, oldName, newName),
        alternatives: e.alternatives.map(alt => ({
          kind: "Alternative",
          tag: alt.tag,
          expression: substitute(alt.expression, oldName, newName),
          bindingName: alt.bindingName,
        })),
      }
    }
    case "Let": {
      return {
        kind: e.kind,
        in: substitute(e.in, oldName, newName),
        newObject: substituteObject(e.newObject),
        name: e.name, // What about shadowing names?
      }
    }
    case "Var": {
      if (e.name == oldName) {
        return mkVar(newName)
      }
    }
    case "PrimPlus": {
      return e;
    }
  }
  unreachable(e);
}


export const enter = (e: Expression): Expression => {
  switch (e.kind) {
    case "Var": {
      const obj = heap[e.name];
      switch (obj.kind) {
        case "FUN":
        case "PAP":
          return e;
        case "CON":
          const stackTop = stack[stack.length - 1];
          if (stackTop !== undefined && stackTop.kind === "CaseCont") {
            console.log("stackTop.alternatives", stackTop.alternatives)
            for (let alt of stackTop.alternatives) {
              // find matching tag branch
              if (alt.tag != obj.tag) { continue }
              switch (alt.tag) {
                case "Nil": {
                  return alt.expression
                }
                case "Cons": {
                  const h = obj.payload[0];
                  const t = obj.payload[1];
                  let exp = substitute(alt.expression, alt.bindingName[0].name, h)
                  exp = substitute(exp, alt.bindingName[1].name, t)
                  return exp;
                }
                case "I": {
                  return alt.expression
                }
              }
            }
          }
          return e;
        case "THUNK":
          console.log("THUNK", e)
          heap[e.name] = { kind: "BLACKHOLE" };
          stack.push({ kind: "UpdateCont", var: e });
          return obj.expression;
        case "BLACKHOLE":
          throw new Error("loopy");
      }
    }
    case "PrimPlus": {
      // TODO - this isn't really a primop in the paper sense because I'm heap-allocating.
      const v = freshVar();
      heap[v.name] = { kind: "CON", tag: "I", payload: [e.a1 + e.a2] }
      return v;
    }
    case "Let": {
      // heap alloc, substitute, enter expression
      const v = freshVar();
      heap[v.name] = e.newObject;
      return substitute(e.in, e.name, v.name);
    }
    case "FunctionCall": {
      if (e.f.kind == "Var") {
        console.log("H", `"${e.f.name}"`, heap)
        const obj = heap[e.f.name];
        switch (obj.kind) {
          case "FUN": {
            console.log("FUN", obj.arguments.length, e.arguments.length)
            if (obj.arguments.length == e.arguments.length) {

              let exp: Expression = obj.expression;
              for (let i = 0; i < obj.arguments.length; i++) {
                exp = substitute(exp, obj.arguments[i].name, e.arguments[i].name)
              }
              console.log("substituted", exp)
              return exp; // substituted all arguments.

            }
            else if (obj.arguments.length > e.arguments.length) {
              // CALLK
              stack.push({kind: "ApplyToArgs", arguments: obj.arguments.slice(e.arguments.length, obj.arguments.length)});

              // substitute everything substitutable
              let exp: Expression = e.f;
              for (let i = 0; i < e.arguments.length; i++) {
                exp = substitute(exp, obj.arguments[i].name, e.arguments[i].name)
              }
              return exp; // substituted all arguments.

            } else if (obj.arguments.length > e.arguments.length) {
              // PAP2
              const p = freshVar();
              heap[p.name] = { kind: "PAP", f: e.f, arguments: e.arguments.slice(0, e.arguments.length) };
              return p;
            }
          }
        } // end switch
      }
      return e.f;
    }
    case "Case": {
      // push continuation, enter expression
      stack.push({ kind: "CaseCont", alternatives: e.alternatives });
      return e.expression;
    }
  }
  unreachable(e);
}

const App: React.FC = () => {

  let expression: Expression = { kind: "Var", name: "main" };
  console.log(expression);
  expression = enter(expression);

  return (
    <div>
      <h2>Spineless Tagless G machine simulator</h2>
      <p>This page simulates a very simple version of the Spineless,
        Tagless G machine with eval/apply calling conventions.</p>
      <p>I mostly followed the paper
         <a href="https://simonmar.github.io/bib/papers/eval-apply.pdf">Making a Fast Curry:
         Push/Enter vs. Eval/Apply for Higher-order Languages</a>, but also referenced the
         <a href="https://wiki.haskell.org/Ministg">MiniSTG</a> language.
      </p>
      <p>This implementation supports only one data type, numbers, and one operation: addition.
        It lacks garbage collection.</p>
    </div>
  );
}

export default App;
