// @ts-check
import { expect, test } from 'vitest';
import fs, { readFileSync, writeFileSync } from 'node:fs';
import * as acorn from 'acorn';
import { tsPlugin } from 'acorn-typescript';
import { walk } from 'zimmerframe';
import { print } from '../src/index.js';

// @ts-expect-error
const acornTs = acorn.Parser.extend(tsPlugin({ allowSatisfies: true }));

/** @param {string} input */
function load(input) {
	const comments = [];

	const ast = /** @type {import('estree').Node} */ (
		acornTs.parse(input, {
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
		})
	);

	walk(ast, null, {
		_(node, { next }) {
			let comment;

			// @ts-expect-error
			while (comments[0] && comments[0].start < node.start) {
				comment = comments.shift();
				(node.leadingComments ??= []).push(comment);
			}

			next();

			if (comments[0]) {
				// @ts-expect-error
				const slice = input.slice(node.end, comments[0].start);

				if (/^[,) \t]*$/.test(slice)) {
					node.trailingComments = [comments.shift()];
				}
			}
		}
	});

	return /** @type {import('estree').Program} */ (ast);
}

/** @param {import('estree').Node} ast */
function clean(ast) {
	const cleaned = walk(ast, null, {
		_(node, context) {
			delete node.loc;
			// @ts-expect-error
			delete node.start;
			// @ts-expect-error
			delete node.end;
			delete node.leadingComments;
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

	test(dir, async () => {
		let input_js = '';
		let input_json = '';
		try {
			input_js = readFileSync(`${__dirname}/samples/${dir}/input.js`).toString();
		} catch (error) {}
		try {
			input_json = readFileSync(`${__dirname}/samples/${dir}/input.json`).toString();
		} catch (error) {}

		/** @type {import('estree').Program} */
		let ast;

		/** @type {import('../src/index.js').PrintOptions} */
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

		writeFileSync(`${__dirname}/samples/${dir}/_actual.js`, code);
		writeFileSync(`${__dirname}/samples/${dir}/_actual.js.map`, JSON.stringify(map, null, '\t'));

		const parsed = acornTs.parse(code, {
			ecmaVersion: 'latest',
			sourceType: input_json.length > 0 ? 'script' : 'module',
			locations: true
		});

		writeFileSync(
			`${__dirname}/samples/${dir}/_actual.json`,
			JSON.stringify(
				parsed,
				(key, value) => (typeof value === 'bigint' ? Number(value) : value),
				'\t'
			)
		);

		expect(code.trim().replace(/^\t+$/gm, '')).toMatchFileSnapshot(
			`${__dirname}/samples/${dir}/expected.js`
		);

		expect(JSON.stringify(map, null, '  ').replaceAll('\\r', '')).toMatchFileSnapshot(
			`${__dirname}/samples/${dir}/expected.js.map`
		);

		expect(clean(/** @type {import('estree').Node} */ (parsed))).toEqual(clean(ast));
	});
}
