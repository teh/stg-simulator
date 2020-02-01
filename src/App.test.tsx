import React from 'react';
import { render } from '@testing-library/react';
import { heap, substitute, enter, Expression, } from './App';

test('runs the MACHINE', () => {
  // let foldl: Expression = enter({ kind: "Var", name: "foldl" })
  let expression: Expression = { kind: "Var", name: "main" };
  for (let i = 0; i < 80; i++) {
    console.log(expression);
    expression = enter(expression);
  }
});
