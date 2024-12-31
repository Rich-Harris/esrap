import * as acorn from 'acorn';
import { tsPlugin } from 'acorn-typescript';
import { walk } from 'zimmerframe';

// @ts-expect-error
export const acornTs = acorn.Parser.extend(tsPlugin({ allowSatisfies: true }));

/** @param {string} input */
export function load(input) {
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
