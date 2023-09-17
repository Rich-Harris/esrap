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

				const next = comments[0] || node;
				comment.has_trailing_newline =
					comment.type === 'Line' || /\n/.test(input.slice(comment.end, next.start));

				(node.leadingComments || (node.leadingComments = [])).push(comment);
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

	return ast;
}

for (const dir of fs.readdirSync(`${__dirname}/samples`)) {
	if (dir[0] === '.') continue;

	test(dir, async () => {
		const input_js = Bun.file(`${__dirname}/samples/${dir}/input.js`);
		const input_json = Bun.file(`${__dirname}/samples/${dir}/input.json`);
		const expected = await Bun.file(`${__dirname}/samples/${dir}/expected.js`).text();

		const ast = input_json.size > 0 ? await input_json.json() : load(await input_js.text());

		const { code, map } = print(ast);

		Bun.write(`${__dirname}/samples/${dir}/_actual.js`, code);
		Bun.write(`${__dirname}/samples/${dir}/_actual.js.map`, map.toString());

		expect(code.trim().replace(/^\t+$/gm, '')).toBe(expected.trim());
	});
}
