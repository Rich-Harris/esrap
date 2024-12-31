import { test } from 'vitest';
import { load } from './common';
import { print } from '../src';
import { expect } from 'vitest';

const test_code = "const foo = () => { const bar = 'baz' }";

test('default indent type is tab', () => {
	const ast = load(test_code);
	const code = print(ast).code;

	expect(code).toMatchInlineSnapshot(`
		"const foo = () => {
			const bar = 'baz';
		};"
	`);
});

test('two space indent', () => {
	const ast = load(test_code);
	const code = print(ast, { indent: '  ' }).code;

	expect(code).toMatchInlineSnapshot(`
		"const foo = () => {
		  const bar = 'baz';
		};"
	`);
});

test('four space indent', () => {
	const ast = load(test_code);
	const code = print(ast, { indent: '    ' }).code;

	expect(code).toMatchInlineSnapshot(`
		"const foo = () => {
		    const bar = 'baz';
		};"
	`);
});
