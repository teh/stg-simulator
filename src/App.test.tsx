import React from 'react';
import { render } from '@testing-library/react';
import { heap, enter, Expression, } from './App';

test('runs the MACHINE', () => {
  let expression: Expression = { kind: "Var", name: "main" };
  console.log(expression);
  expression = enter(expression);
  console.log(expression);
  expression = enter(expression);
  console.log(expression);
  expression = enter(expression);
  console.log(expression);
  expression = enter(expression);
  console.log(expression);
  expression = enter(expression);
  console.log(expression);
  expression = enter(expression);
  console.log(expression);
  expression = enter(expression);
  console.log(expression);
  expression = enter(expression);
  console.log(expression);
  expression = enter(expression);
  console.log(expression);
  expression = enter(expression);
  console.log(expression);
});
