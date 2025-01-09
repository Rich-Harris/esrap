import { test } from 'vitest';
import { print } from '../src/index.js';
import { expect } from 'vitest';
import { load } from './common.js';
import { walk } from 'zimmerframe';
import { TSESTree } from '@typescript-eslint/types';

/**
 * Removes the `raw` property from all `Literal` nodes, as the printer is prefering it's
 * value. Only if the `raw` value is not present it will try to add the prefered quoting
 * @param {TSESTree.Program} ast
 */
function clean(ast) {
	walk(ast, null, {
		Literal(node, { next }) {
			delete node.raw;

			next();
		}
	});
}

const test_code = "const foo = 'bar'";

test('default quote type is single', () => {
	const ast = load(test_code);
	clean(ast);
	const code = print(ast).code;

	expect(code).toMatchInlineSnapshot(`"const foo = 'bar';"`);
});

test('single quotes used when single quote type provided', () => {
	const ast = load(test_code);
	clean(ast);
	const code = print(ast, { quotes: 'single' }).code;

	expect(code).toMatchInlineSnapshot(`"const foo = 'bar';"`);
});

test('double quotes used when double quote type provided', () => {
	const ast = load(test_code);
	clean(ast);
	const code = print(ast, { quotes: 'double' }).code;

	expect(code).toMatchInlineSnapshot(`"const foo = "bar";"`);
});

test('escape single quotes if present in string literal', () => {
	const ast = load('const foo = "b\'ar"');
	clean(ast);
	const code = print(ast, { quotes: 'single' }).code;

	expect(code).toMatchInlineSnapshot(`"const foo = 'b\\'ar';"`);
});

test('escape double quotes if present in string literal', () => {
	const ast = load("const foo = 'b\"ar'");
	clean(ast);
	const code = print(ast, { quotes: 'double' }).code;

	expect(code).toMatchInlineSnapshot(`"const foo = "b\\"ar";"`);
});

test('escapes new lines', () => {
	const ast = load('const str = "a\\nb"');
	clean(ast);
	const code = print(ast).code;

	expect(code).toMatchInlineSnapshot(`"const str = 'a\\nb';"`);
});

test('escapes escape characters', () => {
	const ast = load('const str = "a\\\\nb"');
	clean(ast);
	const code = print(ast).code;

	expect(code).toMatchInlineSnapshot(`"const str = 'a\\\\nb';"`);
});

test('does not escape already-escaped single quotes', () => {
	const ast = load(`const str = 'a\\'b'`);
	clean(ast);
	const code = print(ast).code;

	expect(code).toMatchInlineSnapshot(`"const str = 'a\\'b';"`);
});

test('does not escape already-escaped double quotes', () => {
	const ast = load('const str = "a\\"b"');
	clean(ast);
	const code = print(ast).code;

	expect(code).toMatchInlineSnapshot(`"const str = 'a"b';"`);
});
