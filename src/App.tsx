// TODO
// better pretty printing for
// * CaseCont
// * maybe "unroll" the entire program?

import React, { useState, useEffect } from 'react';
import './App.css';
// import { notStrictEqual } from 'assert';


function unreachable(e: never): never {
  throw new Error("unreachable");
}

interface FUN {
  kind: "FUN",
  arguments: Atom[],
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
  arguments: Atom[],
}

interface THUNK {
  kind: "THUNK",
  expression: Expression,
}

interface BLACKHOLE {
  kind: "BLACKHOLE",
}

interface FunctionApply {
  kind: "FunctionApply",
  f: Var, // lookup on heap
  arguments: Atom[],
}

interface Case {
  kind: "Case",
  expression: Expression,
  alternatives: Alternative[],
}

interface Alternative {
  kind: "Alternative",
  tag: "Cons" | "Nil" | "I" | "default",
  bindingName: Atom[],
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
  a1: Literal,
  a2: Literal,
}
interface Var {
  kind: "Var",
  name: string,
}

interface Literal {
  kind: "Literal",
  name: string,
  value: number,
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
  arguments: Atom[],
}

const mkVar = (name: string): Var => ({ kind: "Var", name });
const mkLiteral = (name: string): Literal => ({ kind: "Literal", name, value: 0 });

let varCounter = 0;
const freshVar = (): Var => {
  return { kind: "Var", name: `$${varCounter++}` }
}

export type HeapObject = FUN | CON | PAP | THUNK | BLACKHOLE;
export type Expression = FunctionApply | Case | Let | PrimPlus | Atom;
export type Continuation = CaseCont | UpdateCont | ApplyToArgs;
export type Atom = Literal | Var;

const stack: Continuation[] = [];


export const mkHeap = (): Record<string, HeapObject> => ({
  nil: { kind: "CON", tag: "Nil", payload: [] },
  zero: { kind: "CON", tag: "I", payload: [{ kind: "Literal", name: "-", value: 0 }] },
  one: { kind: "CON", tag: "I", payload: [{ kind: "Literal", name: "-", value: 1 }] },
  two: { kind: "CON", tag: "I", payload: [{ kind: "Literal", name: "-", value: 2 }] },
  three: { kind: "CON", tag: "I", payload: [{ kind: "Literal", name: "-", value: 3 }] },

  plusInt: {
    kind: "FUN", arguments: [mkVar("x"), mkVar("y")], expression: {
      kind: "Case", expression: mkVar("x"),
      alternatives: [{
        kind: "Alternative", tag: "I", bindingName: [mkLiteral("i")], expression: {
          kind: "Case", expression: mkVar("y"),
          alternatives: [{
            kind: "Alternative", tag: "I", bindingName: [mkLiteral("j")], expression: {
              kind: "Case", expression: { kind: "PrimPlus", a1: mkLiteral("i"), a2: mkLiteral("j") },
              alternatives: [{
                kind: "Alternative",
                tag: "default",
                bindingName: [mkVar("result")],
                expression: {
                  kind: "Let", name: "value",
                  newObject: { kind: "CON", tag: "I", payload: [mkVar("result")] },
                  in: mkVar("value")
                },
              }]
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
        { kind: "Alternative", tag: "Nil", bindingName: [], expression: mkVar("acc") },
        {
          kind: "Alternative", tag: "Cons", bindingName: [mkVar("h"), mkVar("t")], expression: {
            kind: "Let", name: "newAcc", newObject: {
              kind: "THUNK", expression: {
                kind: "FunctionApply", f: mkVar("f"),
                arguments: [mkVar("acc"), mkVar("h")]
              },
            }, in: {
              kind: "FunctionApply", f: mkVar("foldl"), arguments: [mkVar("f"), mkVar("newAcc"), mkVar("t")],
            }
          },
        },
      ]
    }
  },
  // # lazy sum with a well-known space leak
  sum: {
    kind: "FUN", arguments: [mkVar("list")], expression: {
      kind: "FunctionApply", f: mkVar("foldl"), arguments: [mkVar("plusInt"), mkVar("zero"), mkVar("list")],
    }
  },
  list1: { kind: "CON", tag: "Cons", payload: [mkVar("one"), mkVar("nil")] },
  list2: { kind: "CON", tag: "Cons", payload: [mkVar("two"), mkVar("list1")] },
  list3: { kind: "CON", tag: "Cons", payload: [mkVar("three"), mkVar("list2")] },
  main: {
    kind: "THUNK", expression: { kind: "FunctionApply", f: mkVar("sum"), arguments: [mkVar("list3")] },
  }
})
export let heap = mkHeap();



export const substitute = (e: Expression, old: Atom, newAtom: Atom): Expression => {
  const substituteVar = (v: Var): Var => v.name === old.name ? (newAtom as Var) : v;
  const substituteAtom = (v: Atom): Atom => v.name === old.name ? newAtom : v;
  const substituteLiteral = (v: Literal): Literal => v.name === old.name ? (newAtom as Literal) : v;

  const substituteObject = (obj: HeapObject): HeapObject => {
    switch (obj.kind) {
      case "THUNK": {
        return { kind: obj.kind, expression: substitute(obj.expression, old, newAtom) }
      }
      case "CON": {
        return { kind: obj.kind, tag: obj.tag, payload: obj.payload.map(x => substituteAtom(substituteObject(x) as any)) }
      }
      case "FUN": {
        return { kind: obj.kind, arguments: obj.arguments, expression: substitute(obj.expression, old, newAtom) }
      }
      case "PAP": {
        return {
          kind: obj.kind,
          f: substituteVar(obj.f),
          arguments: obj.arguments.map(x => substituteAtom(x)),
        }
      }
    }
    return obj;
  };

  switch (e.kind) {
    case "FunctionApply": {
      return {
        kind: e.kind,
        f: substituteVar(e.f),
        arguments: e.arguments.map(substituteAtom)
      }
    }
    case "Case": {
      // need to walk all Alt branches
      return {
        kind: e.kind,
        expression: substitute(e.expression, old, newAtom),
        alternatives: e.alternatives.map(alt => ({
          kind: "Alternative",
          tag: alt.tag,
          expression: substitute(alt.expression, old, newAtom),
          bindingName: alt.bindingName,
        })),
      }
    }
    case "Let": {
      return {
        kind: e.kind,
        in: substitute(e.in, old, newAtom),
        newObject: substituteObject(e.newObject),
        name: e.name, // What about shadowing names?
      }
    }
    case "Var": {
      if (e.name === old.name) {
        return newAtom
      }
      return e;
    }
    case "PrimPlus": {
      return { kind: e.kind, a1: substituteLiteral(e.a1), a2: substituteLiteral(e.a2) };
    }
    case "Literal": {
      throw new Error("literal can't be substituted")
    }
  }
  unreachable(e);
}


export const enter = (e: Expression): Expression | null => {
  switch (e.kind) {
    case "Literal": {
      const stackTop = stack[stack.length - 1];
      if (stackTop !== undefined && stackTop.kind === "CaseCont") {
        stack.pop();
        const alt = stackTop.alternatives[0]
        if (alt && alt.tag === "default") {
          const lit = mkLiteral(alt.bindingName[0].name);
          lit.value = e.value;
          let exp = substitute(alt.expression, alt.bindingName[0], lit);
          console.log("SUBST", exp)
          return exp;
        }
      }
      throw new Error("no default literal case alternative");
    }
    case "Var": {
      const obj = heap[e.name];
      switch (obj.kind) {
        case "FUN":
          console.log("--- FUN")
          return e;
        case "PAP":
          console.log("--- PAP")
          return e;
        case "CON":
          const stackTop = stack[stack.length - 1];
          if (stackTop !== undefined && stackTop.kind === "CaseCont") {
            stack.pop();
            console.log("stackTop.alternatives", stackTop.alternatives[0])
            for (let alt of stackTop.alternatives) {
              // find matching tag branch
              if (alt.tag !== obj.tag) { continue }
              switch (alt.tag) {
                case "Nil": {
                  return alt.expression
                }
                case "Cons": {
                  const h = obj.payload[0];
                  const t = obj.payload[1];
                  let exp = substitute(alt.expression, alt.bindingName[0], h)
                  exp = substitute(exp, alt.bindingName[1], t)
                  return exp;
                }
                case "I": {
                  // replace variables with literal
                  return substitute(
                    alt.expression,
                    alt.bindingName[0],
                    { kind: "Literal", name: alt.bindingName[0].name, value: obj.payload[0].value }
                  )
                }
              }
            } // end initial for
            for (let alt of stackTop.alternatives) {
              if (alt.tag === "default") {
                console.log("default case")
                return alt.expression;
              }
            }
          } else if (stackTop !== undefined && stackTop.kind === "UpdateCont") {
            stack.pop();
            console.log("stack\n", stack)
            console.log("stackTop.update-var", stackTop.var, "with", e.name);
            heap[stackTop.var.name] = heap[e.name];
            return e;
          }
          return null;
        case "THUNK":
          console.log("THUNK", e)
          heap[e.name] = { kind: "BLACKHOLE" };
          stack.push({ kind: "UpdateCont", var: e });
          return obj.expression;
        case "BLACKHOLE":
          throw new Error("loopy");
      }
      throw new Error("unhandled");
    }
    case "PrimPlus": {
      // TODO - this isn't really a primop in the paper sense because I'm heap-allocating.
      const lit = mkLiteral("-");
      lit.value = e.a1.value + e.a2.value;
      return lit;
    }
    case "Let": {
      // heap alloc, substitute, enter expression
      const v = freshVar();
      heap[v.name] = e.newObject;
      return substitute(e.in, mkVar(e.name), v);
    }
    case "FunctionApply": {
      if (e.f.kind === "Var") {
        // console.log("H", `"${e.f.name}"`, heap)
        const obj = heap[e.f.name];
        switch (obj.kind) {
          case "FUN": {
            console.log("FUN", obj.arguments.length, e.arguments.length)
            if (obj.arguments.length === e.arguments.length) {

              let exp: Expression = obj.expression;
              for (let i = 0; i < obj.arguments.length; i++) {
                exp = substitute(exp, obj.arguments[i], e.arguments[i])
              }
              console.log("substituted", exp)
              return exp; // substituted all arguments.

            }
            else if (obj.arguments.length > e.arguments.length) {
              // CALLK
              stack.push({ kind: "ApplyToArgs", arguments: obj.arguments.slice(e.arguments.length, obj.arguments.length) });

              // substitute everything substitutable
              let exp: Expression = e.f;
              for (let i = 0; i < e.arguments.length; i++) {
                exp = substitute(exp, obj.arguments[i], e.arguments[i])
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

const atomPrettyPrint = (a: Atom): string => {
  switch (a.kind) {
    case "Literal": return a.value.toString();
    case "Var": return a.name;
  }
}

const heapPrettyPrint = (key: string, obj: HeapObject): JSX.Element => {
  switch (obj.kind) {
    case "BLACKHOLE": return <span>{key}: BLACKHOLE</span>;
    case "FUN": return <span>{key}: FUN({obj.arguments.map(x => x.name).join(" ")})</span>;
    case "CON": return <span>{key}: CON({obj.tag} {obj.payload.map(x => atomPrettyPrint(x)).join(" ")})</span>;
    case "PAP": return <span>{key}: PAP</span>;
    case "THUNK": return <span>{key}: THUNK ({expressionPrettyPrint(obj.expression)})</span>;
  }
}

const stackPrettyPrint = (cont: Continuation): JSX.Element => {
  switch (cont.kind) {
    case "ApplyToArgs": return <span>ApplyToArgs</span>;
    case "CaseCont": return (
      <span>
        CaseCont <br/>{cont.alternatives.map(
          branch => (<span className="casecont-branch">{branch.tag} {branch.bindingName.map(y => y.name).join(" ")} -> ...<br/></span>))}
      </span>
    )
      ;
    case "UpdateCont": return <span>UpdateCont <span className="heap-object">{atomPrettyPrint(cont.var)}</span></span>;
  }
}

const expressionPrettyPrint = (e: Expression): JSX.Element => {
  switch (e.kind) {
    case "Case": return <span>Case ({expressionPrettyPrint(e.expression)}) of</span>;
    case "FunctionApply": return <span>FunctionApply {atomPrettyPrint(e.f)}</span>;
    case "Let": return <span>Let {e.name} in {heapPrettyPrint(e.name, e.newObject)}</span>;
    case "Literal": return <span>Literal</span>;
    case "Var": return <span>Var {e.name}</span>;
    case "PrimPlus": return <span>{atomPrettyPrint(e.a1)} + {atomPrettyPrint(e.a2)}</span>;
  }
}


const App: React.FC = () => {
  let [step, setStep] = useState(0);
  let expression: Expression | null = { kind: "Var", name: "main" };

  // We're re-running all steps up to N each time.
  heap = mkHeap();
  varCounter = 0;
  stack.splice(0, stack.length);
  for (let i = 0; i < step; i++) {
    console.log(expression);
    if (expression == null) break;
    expression = enter(expression);
  }

  const backStep = () => { if (step > 0) { setStep(step - 1) } };
  const forwardStep = () => { if (expression != null) { setStep(step + 1) } }

  const keyPress = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      backStep();
    }
    if (e.key === "ArrowRight") {
      forwardStep();
    }
  }
  useEffect(() => {
    window.addEventListener("keydown", keyPress as any);
    return () => {
      window.removeEventListener("keydown", keyPress as any);
    };
  }, [step])


  return (
    <div className="stackheap">
      <div className="description">
        <h2>Spineless Tagless G machine simulator (STG)</h2>
        <p>Use the left (<span aria-label="step back" role="img">⬅️</span>) and right
        (<span aria-label="step forward" role="img">➡️</span>) arrow keys to step.</p>
        <p>This page simulates a very simple version of the STG
           machine with eval/apply calling conventions.
        Read the <a href="/posts/spineless-tagless-g/">blog post</a> for details.
      </p>
        <div className="step-value">Step: {step}</div>
        <div className="expression-value">{expression === null ? null : expressionPrettyPrint(expression)}</div>
        <hr/>
        <pre>{`
nil = CON(Nil);
zero = CON(I 0);
one = CON(I 1);
two = CON(I 2);
three = CON(I 3);

plusInt = FUN(x y ->
  case x of {
    I i -> case y of {
      I j -> case plus# i j of {
        x -> let { result = CON (I x) } in result }}});

foldl = FUN(f acc list ->
  case list of {
    Nil -> acc;
    Cons h t -> let {
      newAcc = THUNK(f acc h)
    } in foldl f newAcc t
  });

  # lazy sum with a well-known space leak
  sum = FUN(list -> foldl plusInt zero list);

  list1 = CON(Cons one nil);
  list2 = CON(Cons two list1);
  list3 = CON(Cons three list2);

  main = THUNK(sum list3);
          `}</pre>
        <a href="https://wiki.haskell.org/Ministg#Source_language">Program borrowed from here</a>
      </div>
      <div className="stack">
        <h2>Stack</h2>
        <ul>
          {stack.map(x => <li>{stackPrettyPrint(x)}</li>)}
        </ul>
      </div>
      <div className="heap">
        <h2>Heap</h2>
        <ul>
          {Object.keys(heap).map(x =>
            <li className={expression?.kind === "Var" ? (expression.name === x ? "heap-var-active" : "") : ""}>
              {heapPrettyPrint(x, heap[x])}</li>)}
        </ul>
      </div>
    </div>
  );
}

export default App;
