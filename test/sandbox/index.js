// @ts-check
/** @import { TSESTree } from '@typescript-eslint/types' */
/** @import { NodeWithComments } from '../../src/types' */
import * as acorn from 'acorn';
import { tsPlugin } from 'acorn-typescript';
import { walk } from 'zimmerframe';
import { print } from '../../src/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** @param {string} input */
function load(input) {
	const comments = [];

	// @ts-expect-error
	const acornTs = acorn.Parser.extend(tsPlugin({ allowSatisfies: true }));

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
			const commentNode = /** @type {NodeWithComments} */ (/** @type {any} */ (node));
			let comment;

			while (comments[0] && comments[0].start < node.start) {
				comment = comments.shift();
				(commentNode.leadingComments ||= []).push(comment);
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

const dir = path.resolve(fileURLToPath(import.meta.url), '..');
const input_js = fs.readFileSync(`${dir}/_input.ts`);
const content = input_js.toString();
const ast = load(content);
const { code } = print(ast, {});
fs.writeFileSync(`${dir}/_output.ts`, code);
