// @ts-check
/** @import { TSESTree } from '@typescript-eslint/types' */
/** @import { NodeWithComments, PrintOptions } from '../src/types' */
import fs from 'node:fs';
import { expect, test } from 'vitest';
import * as acorn from 'acorn';
import { tsPlugin } from 'acorn-typescript';
import { walk } from 'zimmerframe';
import { print } from '../src/index.js';

// @ts-expect-error
const acornTs = acorn.Parser.extend(tsPlugin({ allowSatisfies: true }));

/** @param {string} input */
function load(input) {
	const comments = [];

	const ast = acornTs.parse(input, {
		ecmaVersion: 'latest',
		sourceType: 'module',
		locations: true,
		onComment: (block, value, start, end) => {
			if (block && /\n/.test(value)) {
				let a = start;
				while (a > 0 && input[a - 1] !== '\n') a -= 1;

				let b = a;
				while (/[ \t]/.test(input[b])) b += 1;

				const indentation = input.slice(a, b);
				value = value.replace(new RegExp(`^${indentation}`, 'gm'), '');
			}

			comments.push({ type: block ? 'Block' : 'Line', value, start, end });
		}
	});

	walk(ast, null, {
		_(node, { next }) {
			let comment;
			const commentNode = /** @type {NodeWithComments} */ (/** @type {any} */ (node));

			while (comments[0] && comments[0].start < node.start) {
				comment = comments.shift();
				(commentNode.leadingComments ??= []).push(comment);
			}

			next();

			if (comments[0]) {
				const slice = input.slice(node.end, comments[0].start);

				if (/^[,) \t]*$/.test(slice)) {
					commentNode.trailingComments = [comments.shift()];
				}
			}
		}
	});

	return /** @type {TSESTree.Program} */ (/** @type {any} */ (ast));
}

/** @param {TSESTree.Node} ast */
function clean(ast) {
	const cleaned = walk(ast, null, {
		_(node, context) {
			// @ts-expect-error
			delete node.loc;
			// @ts-expect-error
			delete node.start;
			// @ts-expect-error
			delete node.end;
			// @ts-expect-error
			delete node.leadingComments;
			// @ts-expect-error
			delete node.trailingComments;
			context.next();
		},
		Program(node, context) {
			node.body = node.body.filter((node) => node.type !== 'EmptyStatement');
			context.next();
		},
		BlockStatement(node, context) {
			node.body = node.body.filter((node) => node.type !== 'EmptyStatement');
			context.next();
		},
		Property(node, context) {
			if (node.kind === 'init') {
				if (node.value.type === 'FunctionExpression') {
					node.method = true;
				}

				const value = node.value.type === 'AssignmentPattern' ? node.value.left : node.value;

				if (!node.computed && node.key.type === 'Identifier' && value.type === 'Identifier') {
					node.shorthand = node.key.name === value.name;
				}
			}

			context.next();
		}
	});

	return cleaned;
}

for (const dir of fs.readdirSync(`${__dirname}/samples`)) {
	if (dir[0] === '.') continue;
	const tsMode = dir.startsWith('ts-');
	const fileExtension = tsMode ? 'ts' : 'js';

	test(dir, async () => {
		let input_js = '';
		let input_json = '';
		try {
			input_js = fs.readFileSync(`${__dirname}/samples/${dir}/input.${fileExtension}`, 'utf-8');
		} catch (error) {}
		try {
			input_json = fs.readFileSync(`${__dirname}/samples/${dir}/input.json`).toString();
		} catch (error) {}

		/** @type {TSESTree.Program} */
		let ast;

		/** @type {PrintOptions} */
		let opts;

		if (input_json.length > 0) {
			ast = JSON.parse(input_json);
			opts = {};
		} else {
			const content = input_js;
			ast = load(content);
			opts = {
				sourceMapSource: 'input.js',
				sourceMapContent: content
			};
		}

		const { code, map } = print(ast, opts);

		fs.writeFileSync(`${__dirname}/samples/${dir}/_actual.${fileExtension}`, code);
		fs.writeFileSync(
			`${__dirname}/samples/${dir}/_actual.${fileExtension}.map`,
			JSON.stringify(map, null, '\t')
		);

		const parsed = acornTs.parse(code, {
			ecmaVersion: 'latest',
			sourceType: input_json.length > 0 ? 'script' : 'module',
			locations: true
		});

		fs.writeFileSync(
			`${__dirname}/samples/${dir}/_actual.json`,
			JSON.stringify(
				parsed,
				(key, value) => (typeof value === 'bigint' ? Number(value) : value),
				'\t'
			)
		);

		expect(code.trim().replace(/^\t+$/gm, '').replaceAll('\r', '')).toMatchFileSnapshot(
			`${__dirname}/samples/${dir}/expected.${fileExtension}`
		);

		expect(JSON.stringify(map, null, '  ').replaceAll('\\r', '')).toMatchFileSnapshot(
			`${__dirname}/samples/${dir}/expected.${fileExtension}.map`
		);

		expect(clean(/** @type {TSESTree.Node} */ (/** @type {any} */ (parsed)))).toEqual(clean(ast));
	});
}
