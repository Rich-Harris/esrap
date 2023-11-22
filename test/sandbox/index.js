// @ts-check
import { parse } from 'acorn';
import { walk } from 'zimmerframe';
import { print } from '../../src/index.js';

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

	return /** @type {import('estree').Program} */ (ast);
}

const input_js = Bun.file(`${import.meta.dir}/_input.js`);
const content = await input_js.text();
const ast = load(content);
const { code } = print(ast, {});
Bun.write(`${import.meta.dir}/_output.js`, code);
