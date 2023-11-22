// @ts-check
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import { parse } from 'acorn';
import { walk } from 'zimmerframe';
import { print } from '../src/index.js';

/** @param {string} input */
function load(input) {
	const comments = [];

	const ast = /** @type {import('estree').Node} */ (
		parse(input, {
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

			while (comments[0] && comments[0].start < node.start) {
				comment = comments.shift();
				(node.leadingComments ??= []).push(comment);
			}

			next();

			if (comments[0]) {
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
			delete node.start;
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
		const input_js = Bun.file(`${__dirname}/samples/${dir}/input.js`);
		const input_json = Bun.file(`${__dirname}/samples/${dir}/input.json`);

		/** @type {import('estree').Program} */
		let ast;

		/** @type {import('../src/index.js').PrintOptions} */
		let opts;

		if (input_json.size > 0) {
			ast = await input_json.json();
			opts = {};
		} else {
			const content = await input_js.text();
			ast = load(content);
			opts = {
				sourceMapSource: 'input.js',
				sourceMapContent: content
			};
		}

		const { code, map } = print(ast, opts);

		Bun.write(`${__dirname}/samples/${dir}/_actual.js`, code);
		Bun.write(`${__dirname}/samples/${dir}/_actual.js.map`, JSON.stringify(map, null, '\t'));

		const parsed = parse(code, {
			ecmaVersion: 'latest',
			sourceType: input_json.size > 0 ? 'script' : 'module'
		});

		Bun.write(
			`${__dirname}/samples/${dir}/_actual.json`,
			JSON.stringify(parsed, (value) => (typeof value === 'bigint' ? Number(value) : value), '\t')
		);

		const expected = await Bun.file(`${__dirname}/samples/${dir}/expected.js`).text();
		expect(code.trim().replace(/^\t+$/gm, '')).toBe(expected.trim());

		const expected_map = await Bun.file(`${__dirname}/samples/${dir}/expected.js.map`).json();
		expect(map).toEqual(expected_map);

		expect(clean(/** @type {import('estree').Node} */ (parsed))).toEqual(clean(ast));
	});
}
