/**
 * File with intentional syntax errors for testing error recovery
 */

// Valid function
export function validFunction() {
  return 'This is valid';
}

// Syntax error: missing closing brace
function brokenFunction() {
  const x = 1;
  const y = 2;
  return x + y;
// Missing }

// This should still be parsed if error recovery works
export function anotherValidFunction() {
  return 'This should be extracted';
}

// Syntax error: invalid syntax
const broken = function(

// Yet another valid function after errors
export function finalValidFunction(): string {
  return 'Final function';
}
