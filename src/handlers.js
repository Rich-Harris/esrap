// heavily based on https://github.com/davidbonnet/astring
// released under MIT license https://github.com/davidbonnet/astring/blob/master/LICENSE

/**
 * Does `array.push` for all `items`. Needed because `array.push(...items)` throws
 * "Maximum call stack size exceeded" when `items` is too big of an array.
 *
 * @param {any[]} array
 * @param {any[]} items
 */
function push_array(array, items) {
	for (let i = 0; i < items.length; i++) {
		array.push(items[i]);
	}
}

/**
 * @param {import('estree').Node} node
 * @param {import('./types').State} state
 * @returns {import('./types').Chunk[]}
 */
export function handle(node, state) {
	const handler = handlers[node.type];

	if (!handler) {
		throw new Error(`Not implemented ${node.type}`);
	}

	// @ts-expect-error
	const result = handler(node, state);

	if (node.leadingComments) {
		prepend_comments(result, node.leadingComments, state);
	}

	if (node.trailingComments) {
		state.comments.push(node.trailingComments[0]); // there is only ever one
	}

	return result;
}

/**
 * @param {string} content
 * @param {import('estree').Node} [node]
 * @returns {import('./types').Chunk}
 */
function c(content, node) {
	return {
		content,
		loc: node?.loc ?? null,
		has_newline: /\n/.test(content)
	};
}

/**
 * @param {import('./types').Chunk[]} chunks
 * @param {import('estree').Comment[]} comments
 * @param {import('./types').State} state
 */
function prepend_comments(chunks, comments, state) {
	chunks.unshift(
		c(
			comments
				.map((comment) =>
					comment.type === 'Block'
						? `/*${comment.value}*/${
								/** @type {any} */ (comment).has_trailing_newline ? `\n${state.indent}` : ` `
						  }`
						: `//${comment.value}${
								/** @type {any} */ (comment).has_trailing_newline ? `\n${state.indent}` : ` `
						  }`
				)
				.join(``)
		)
	);
}

const OPERATOR_PRECEDENCE = {
	'||': 2,
	'&&': 3,
	'??': 4,
	'|': 5,
	'^': 6,
	'&': 7,
	'==': 8,
	'!=': 8,
	'===': 8,
	'!==': 8,
	'<': 9,
	'>': 9,
	'<=': 9,
	'>=': 9,
	in: 9,
	instanceof: 9,
	'<<': 10,
	'>>': 10,
	'>>>': 10,
	'+': 11,
	'-': 11,
	'*': 12,
	'%': 12,
	'/': 12,
	'**': 13
};

/** @type {Record<import('estree').Expression['type'] | 'Super' | 'RestElement', number>} */
const EXPRESSIONS_PRECEDENCE = {
	ArrayExpression: 20,
	TaggedTemplateExpression: 20,
	ThisExpression: 20,
	Identifier: 20,
	Literal: 18,
	TemplateLiteral: 20,
	Super: 20,
	SequenceExpression: 20,
	MemberExpression: 19,
	MetaProperty: 19,
	CallExpression: 19,
	ChainExpression: 19,
	ImportExpression: 19,
	NewExpression: 19,
	AwaitExpression: 17,
	ClassExpression: 17,
	FunctionExpression: 17,
	ObjectExpression: 17,
	UpdateExpression: 16,
	UnaryExpression: 15,
	BinaryExpression: 14,
	LogicalExpression: 13,
	ConditionalExpression: 4,
	ArrowFunctionExpression: 3,
	AssignmentExpression: 3,
	YieldExpression: 2,
	RestElement: 1
};

/**
 *
 * @param {import('estree').Expression} node
 * @param {import('estree').BinaryExpression | import('estree').LogicalExpression} parent
 * @param {boolean} is_right
 * @returns
 */
function needs_parens(node, parent, is_right) {
	// special case where logical expressions and coalesce expressions cannot be mixed,
	// either of them need to be wrapped with parentheses
	if (
		node.type === 'LogicalExpression' &&
		parent.type === 'LogicalExpression' &&
		((parent.operator === '??' && node.operator !== '??') ||
			(parent.operator !== '??' && node.operator === '??'))
	) {
		return true;
	}

	const precedence = EXPRESSIONS_PRECEDENCE[node.type];
	const parent_precedence = EXPRESSIONS_PRECEDENCE[parent.type];

	if (precedence !== parent_precedence) {
		// Different node types
		return (
			(!is_right && precedence === 15 && parent_precedence === 14 && parent.operator === '**') ||
			precedence < parent_precedence
		);
	}

	if (precedence !== 13 && precedence !== 14) {
		// Not a `LogicalExpression` or `BinaryExpression`
		return false;
	}

	if (
		/** @type {import('estree').BinaryExpression} */ (node).operator === '**' &&
		parent.operator === '**'
	) {
		// Exponentiation operator has right-to-left associativity
		return !is_right;
	}

	if (is_right) {
		// Parenthesis are used if both operators have the same precedence
		return (
			OPERATOR_PRECEDENCE[/** @type {import('estree').BinaryExpression} */ (node).operator] <=
			OPERATOR_PRECEDENCE[parent.operator]
		);
	}

	return (
		OPERATOR_PRECEDENCE[/** @type {import('estree').BinaryExpression} */ (node).operator] <
		OPERATOR_PRECEDENCE[parent.operator]
	);
}

/** @param {import('estree').Node} node */
function has_call_expression(node) {
	while (node) {
		if (node.type === 'CallExpression') {
			return true;
		} else if (node.type === 'MemberExpression') {
			node = node.object;
		} else {
			return false;
		}
	}
}

/** @param {import('./types').Chunk[]} chunks */
const has_newline = (chunks) => {
	for (let i = 0; i < chunks.length; i += 1) {
		if (chunks[i].has_newline) return true;
	}
	return false;
};

/** @param {import('./types').Chunk[]} chunks */
const get_length = (chunks) => {
	let total = 0;
	for (let i = 0; i < chunks.length; i += 1) {
		total += chunks[i].content.length;
	}
	return total;
};

/**
 * @param {number} a
 * @param {number} b
 */
const sum = (a, b) => a + b;

/**
 * @param {import('./types').Chunk[][]} nodes
 * @param {import('./types').Chunk} separator
 * @returns {import('./types').Chunk[]}
 */
const join = (nodes, separator) => {
	if (nodes.length === 0) return [];

	const joined = [...nodes[0]];
	for (let i = 1; i < nodes.length; i += 1) {
		joined.push(separator);
		push_array(joined, nodes[i]);
	}
	return joined;
};

const grouped_expression_types = [
	'ImportDeclaration',
	'VariableDeclaration',
	'ExportDefaultDeclaration',
	'ExportNamedDeclaration'
];

/**
 * @param {import('estree').Node[]} nodes
 * @param {import('./types').State} state
 */
const handle_body = (nodes, state) => {
	/** @type {import('./types').Chunk[][][]} */
	const groups = [];

	/** @type {import('./types').Chunk[][]} */
	let group = [];

	let last_statement = /** @type {import('estree').Node} */ ({ type: 'EmptyStatement' });

	function flush() {
		if (group.length > 0) {
			groups.push(group);
			group = [];
		}
	}

	for (const statement of nodes) {
		if (statement.type === 'EmptyStatement') continue;

		if (
			(grouped_expression_types.includes(statement.type) ||
				grouped_expression_types.includes(last_statement.type)) &&
			last_statement.type !== statement.type
		) {
			flush();
		}

		const leadingComments = statement.leadingComments;
		delete statement.leadingComments;

		const chunks = handle(statement, {
			...state,
			indent: state.indent
		});

		// if a statement requires multiple lines, or it has a leading `/**` comment,
		// we add blank lines around it
		const standalone =
			has_newline(chunks) ||
			(leadingComments?.[0]?.type === 'Block' && leadingComments[0].value.startsWith('*'));

		if (leadingComments && leadingComments.length > 0) {
			prepend_comments(chunks, leadingComments, state);
			flush();
		}

		let add_newline = false;

		while (state.comments.length) {
			const comment = /** @type {import('estree').Comment} */ (state.comments.shift());
			const prefix = add_newline ? `\n${state.indent}` : ` `;

			chunks.push(
				c(
					comment.type === 'Block' ? `${prefix}/*${comment.value}*/` : `${prefix}//${comment.value}`
				)
			);

			add_newline = comment.type === 'Line';
		}

		if (standalone) {
			flush();
			group.push(chunks);
			flush();
		} else {
			group.push(chunks);
		}

		last_statement = statement;
	}

	flush();

	const chunks = [];

	for (let i = 0; i < groups.length; i += 1) {
		if (i > 0) {
			chunks.push(c(`\n\n${state.indent}`));
		}

		for (let j = 0; j < groups[i].length; j += 1) {
			if (j > 0) {
				chunks.push(c(`\n${state.indent}`));
			}

			push_array(chunks, groups[i][j]);
		}
	}

	return chunks;
};

/**
 * @param {import('estree').VariableDeclaration} node
 * @param {import('./types').State} state
 */
const handle_var_declaration = (node, state) => {
	const chunks = [c(`${node.kind} `)];

	const declarators = node.declarations.map((d) =>
		handle(d, {
			...state,
			indent: state.indent + (node.declarations.length === 1 ? '' : '\t')
		})
	);

	const multiple_lines =
		declarators.some(has_newline) ||
		declarators.map(get_length).reduce(sum, 0) +
			(state.indent.length + declarators.length - 1) * 2 >
			80;

	const separator = c(multiple_lines ? `,\n${state.indent}\t` : ', ');

	push_array(chunks, join(declarators, separator));

	return chunks;
};

const shared = {
	/**
	 * @param {import('estree').ArrayExpression | import('estree').ArrayPattern} node
	 * @param {import('./types').State} state
	 */
	'ArrayExpression|ArrayPattern': (node, state) => {
		const chunks = [c('[')];

		/** @type {import('./types').Chunk[][]} */
		const elements = [];

		/** @type {import('./types').Chunk[]} */
		let sparse_commas = [];

		for (let i = 0; i < node.elements.length; i += 1) {
			// can't use map/forEach because of sparse arrays
			const element = node.elements[i];
			if (element) {
				elements.push([
					...sparse_commas,
					...handle(element, {
						...state,
						indent: state.indent + '\t'
					})
				]);
				sparse_commas = [];
			} else {
				sparse_commas.push(c(','));
			}
		}

		const multiple_lines =
			elements.some(has_newline) ||
			elements.map(get_length).reduce(sum, 0) + (state.indent.length + elements.length - 1) * 2 >
				80;

		if (multiple_lines) {
			chunks.push(c(`\n${state.indent}\t`));
			push_array(chunks, join(elements, c(`,\n${state.indent}\t`)));
			chunks.push(c(`\n${state.indent}`));
			push_array(chunks, sparse_commas);
		} else {
			push_array(chunks, join(elements, c(', ')));
			push_array(chunks, sparse_commas);
		}

		chunks.push(c(']'));

		return chunks;
	},

	/**
	 * @param {import('estree').BinaryExpression | import('estree').LogicalExpression} node
	 * @param {import('./types').State} state
	 */
	'BinaryExpression|LogicalExpression': (node, state) => {
		/**
		 * @type any[]
		 */
		const chunks = [];

		// TODO
		// const is_in = node.operator === 'in';
		// if (is_in) {
		// 	// Avoids confusion in `for` loops initializers
		// 	chunks.push(c('('));
		// }

		if (needs_parens(node.left, node, false)) {
			chunks.push(c('('));
			push_array(chunks, handle(node.left, state));
			chunks.push(c(')'));
		} else {
			push_array(chunks, handle(node.left, state));
		}

		chunks.push(c(` ${node.operator} `));

		if (needs_parens(node.right, node, true)) {
			chunks.push(c('('));
			push_array(chunks, handle(node.right, state));
			chunks.push(c(')'));
		} else {
			push_array(chunks, handle(node.right, state));
		}

		return chunks;
	},

	/**
	 * @param {import('estree').BlockStatement | import('estree').ClassBody} node
	 * @param {import('./types').State} state
	 */
	'BlockStatement|ClassBody': (node, state) => {
		if (node.body.length === 0) return [c('{}')];

		return [
			c(`{\n${state.indent}\t`),
			...handle_body(node.body, { ...state, indent: state.indent + '\t' }),
			c(`\n${state.indent}}`)
		];
	},

	/**
	 * @param {import('estree').ClassDeclaration | import('estree').ClassExpression} node
	 * @param {import('./types').State} state
	 */
	'ClassDeclaration|ClassExpression': (node, state) => {
		const chunks = [c('class ')];

		if (node.id) {
			push_array(chunks, handle(node.id, state));
			chunks.push(c(' '));
		}

		if (node.superClass) {
			chunks.push(c('extends '));
			push_array(chunks, handle(node.superClass, state));
			chunks.push(c(' '));
		}

		push_array(chunks, handle(node.body, state));

		return chunks;
	},

	/**
	 * @param {import('estree').ForInStatement | import('estree').ForOfStatement} node
	 * @param {import('./types').State} state
	 */
	'ForInStatement|ForOfStatement': (node, state) => {
		const chunks = [c(`for ${node.type === 'ForOfStatement' && node.await ? 'await ' : ''}(`)];

		if (node.left.type === 'VariableDeclaration') {
			push_array(chunks, handle_var_declaration(node.left, state));
		} else {
			push_array(chunks, handle(node.left, state));
		}

		chunks.push(c(node.type === 'ForInStatement' ? ` in ` : ` of `));
		push_array(chunks, handle(node.right, state));
		chunks.push(c(') '));
		push_array(chunks, handle(node.body, state));

		return chunks;
	},

	/**
	 * @param {import('estree').FunctionDeclaration | import('estree').FunctionExpression} node
	 * @param {import('./types').State} state
	 */
	'FunctionDeclaration|FunctionExpression': (node, state) => {
		const chunks = [];

		if (node.async) chunks.push(c('async '));
		chunks.push(c(node.generator ? 'function* ' : 'function '));
		if (node.id) push_array(chunks, handle(node.id, state));
		chunks.push(c('('));

		const params = node.params.map((p) =>
			handle(p, {
				...state,
				indent: state.indent + '\t'
			})
		);

		const multiple_lines =
			params.some(has_newline) ||
			params.map(get_length).reduce(sum, 0) + (state.indent.length + params.length - 1) * 2 > 80;

		const separator = c(multiple_lines ? `,\n${state.indent}` : ', ');

		if (multiple_lines) {
			chunks.push(c(`\n${state.indent}\t`));
			push_array(chunks, join(params, separator));
			chunks.push(c(`\n${state.indent}`));
		} else {
			push_array(chunks, join(params, separator));
		}

		chunks.push(c(') '));
		push_array(chunks, handle(node.body, state));

		return chunks;
	},

	/**
	 * @param {import('estree').RestElement | import('estree').SpreadElement} node
	 * @param {import('./types').State} state
	 */
	'RestElement|SpreadElement': (node, state) => {
		return [c('...'), ...handle(node.argument, state)];
	}
};

/** @type {import('./types').Handlers} */
const handlers = {
	ArrayExpression: shared['ArrayExpression|ArrayPattern'],

	ArrayPattern: shared['ArrayExpression|ArrayPattern'],

	ArrowFunctionExpression: (node, state) => {
		const chunks = [];

		if (node.async) chunks.push(c('async '));

		if (node.params.length === 1 && node.params[0].type === 'Identifier') {
			push_array(chunks, handle(node.params[0], state));
		} else {
			const params = node.params.map((param) =>
				handle(param, {
					...state,
					indent: state.indent + '\t'
				})
			);

			chunks.push(c('('));
			push_array(chunks, join(params, c(', ')));
			chunks.push(c(')'));
		}

		chunks.push(c(' => '));

		if (
			node.body.type === 'ObjectExpression' ||
			(node.body.type === 'AssignmentExpression' && node.body.left.type === 'ObjectPattern')
		) {
			chunks.push(c('('));
			push_array(chunks, handle(node.body, state));
			chunks.push(c(')'));
		} else {
			push_array(chunks, handle(node.body, state));
		}

		return chunks;
	},

	AssignmentExpression(node, state) {
		return [...handle(node.left, state), c(` ${node.operator} `), ...handle(node.right, state)];
	},

	AssignmentPattern(node, state) {
		return [...handle(node.left, state), c(` = `), ...handle(node.right, state)];
	},

	AwaitExpression(node, state) {
		if (node.argument) {
			const precedence = EXPRESSIONS_PRECEDENCE[node.argument.type];

			if (precedence && precedence < EXPRESSIONS_PRECEDENCE.AwaitExpression) {
				return [c('await ('), ...handle(node.argument, state), c(')')];
			} else {
				return [c('await '), ...handle(node.argument, state)];
			}
		}

		return [c('await')];
	},

	BinaryExpression: shared['BinaryExpression|LogicalExpression'],

	BlockStatement: shared['BlockStatement|ClassBody'],

	BreakStatement(node, state) {
		return node.label ? [c('break '), ...handle(node.label, state), c(';')] : [c('break;')];
	},

	CallExpression(node, state) {
		/**
		 * @type any[]
		 */
		const chunks = [];

		if (EXPRESSIONS_PRECEDENCE[node.callee.type] < EXPRESSIONS_PRECEDENCE.CallExpression) {
			chunks.push(c('('));
			push_array(chunks, handle(node.callee, state));
			chunks.push(c(')'));
		} else {
			push_array(chunks, handle(node.callee, state));
		}

		if (/** @type {import('estree').SimpleCallExpression} */ (node).optional) {
			chunks.push(c('?.'));
		}

		let has_inline_comment = false;
		let arg_chunks = [];
		outer: for (const arg of node.arguments) {
			const chunks = [];
			while (state.comments.length) {
				const comment = /** @type {import('estree').Comment} */ (state.comments.shift());
				if (comment.type === 'Line') {
					has_inline_comment = true;
					break outer;
				}
				chunks.push(c(comment.type === 'Block' ? `/*${comment.value}*/ ` : `//${comment.value}`));
			}
			push_array(chunks, handle(arg, state));
			arg_chunks.push(chunks);
		}

		const multiple_lines = has_inline_comment || arg_chunks.slice(0, -1).some(has_newline); // TODO or length exceeds 80
		if (multiple_lines) {
			// need to handle args again. TODO find alternative approach?
			const args = node.arguments.map((arg, i) => {
				const chunks = handle(arg, {
					...state,
					indent: `${state.indent}\t`
				});
				if (i < node.arguments.length - 1) chunks.push(c(','));
				while (state.comments.length) {
					const comment = /** @type {import('estree').Comment} */ (state.comments.shift());
					chunks.push(
						c(comment.type === 'Block' ? ` /*${comment.value}*/ ` : ` //${comment.value}`)
					);
				}
				return chunks;
			});

			chunks.push(c(`(\n${state.indent}\t`));
			push_array(chunks, join(args, c(`\n${state.indent}\t`)));
			chunks.push(c(`\n${state.indent})`));
		} else {
			chunks.push(c('('));
			push_array(chunks, join(arg_chunks, c(', ')));
			chunks.push(c(')'));
		}

		return chunks;
	},

	ChainExpression(node, state) {
		return handle(node.expression, state);
	},

	ClassBody: shared['BlockStatement|ClassBody'],

	ClassDeclaration: shared['ClassDeclaration|ClassExpression'],

	ClassExpression: shared['ClassDeclaration|ClassExpression'],

	ConditionalExpression(node, state) {
		/**
		 * @type any[]
		 */
		const chunks = [];

		if (EXPRESSIONS_PRECEDENCE[node.test.type] > EXPRESSIONS_PRECEDENCE.ConditionalExpression) {
			push_array(chunks, handle(node.test, state));
		} else {
			chunks.push(c('('));
			push_array(chunks, handle(node.test, state));
			chunks.push(c(')'));
		}

		const child_state = { ...state, indent: state.indent + '\t' };

		const consequent = handle(node.consequent, child_state);
		const alternate = handle(node.alternate, child_state);

		const multiple_lines =
			has_newline(consequent) ||
			has_newline(alternate) ||
			get_length(chunks) + get_length(consequent) + get_length(alternate) > 50;

		if (multiple_lines) {
			chunks.push(c(`\n${state.indent}? `));
			push_array(chunks, consequent);
			chunks.push(c(`\n${state.indent}: `));
			push_array(chunks, alternate);
		} else {
			chunks.push(c(` ? `));
			push_array(chunks, consequent);
			chunks.push(c(` : `));
			push_array(chunks, alternate);
		}

		return chunks;
	},

	ContinueStatement(node, state) {
		return node.label ? [c('continue '), ...handle(node.label, state), c(';')] : [c('continue;')];
	},

	DebuggerStatement(node, state) {
		return [c('debugger', node), c(';')];
	},

	DoWhileStatement(node, state) {
		return [
			c('do '),
			...handle(node.body, state),
			c(' while ('),
			...handle(node.test, state),
			c(');')
		];
	},

	EmptyStatement(node, state) {
		return [c(';')];
	},

	ExportAllDeclaration(node, state) {
		return [c(`export * from `), ...handle(node.source, state), c(`;`)];
	},

	ExportDefaultDeclaration(node, state) {
		const chunks = [c(`export default `), ...handle(node.declaration, state)];

		if (node.declaration.type !== 'FunctionDeclaration') {
			chunks.push(c(';'));
		}

		return chunks;
	},

	ExportNamedDeclaration(node, state) {
		const chunks = [c('export ')];

		if (node.declaration) {
			push_array(chunks, handle(node.declaration, state));
		} else {
			const specifiers = node.specifiers.map((specifier) => {
				const name = handle(specifier.local, state)[0];
				const as = handle(specifier.exported, state)[0];

				if (name.content === as.content) {
					return [name];
				}

				return [name, c(' as '), as];
			});

			const width = 7 + specifiers.map(get_length).reduce(sum, 0) + 2 * specifiers.length;

			if (width > 80) {
				chunks.push(c('{\n\t'));
				push_array(chunks, join(specifiers, c(',\n\t')));
				chunks.push(c('\n}'));
			} else {
				chunks.push(c('{ '));
				push_array(chunks, join(specifiers, c(', ')));
				chunks.push(c(' }'));
			}

			if (node.source) {
				chunks.push(c(' from '));
				push_array(chunks, handle(node.source, state));
			}
		}

		chunks.push(c(';'));

		return chunks;
	},

	ExpressionStatement(node, state) {
		if (
			node.expression.type === 'AssignmentExpression' &&
			node.expression.left.type === 'ObjectPattern'
		) {
			// is an AssignmentExpression to an ObjectPattern
			return [c('('), ...handle(node.expression, state), c(');')];
		}

		return [...handle(node.expression, state), c(';')];
	},

	ForStatement: (node, state) => {
		const chunks = [c('for (')];

		if (node.init) {
			if (node.init.type === 'VariableDeclaration') {
				push_array(chunks, handle_var_declaration(node.init, state));
			} else {
				push_array(chunks, handle(node.init, state));
			}
		}

		chunks.push(c('; '));
		if (node.test) push_array(chunks, handle(node.test, state));
		chunks.push(c('; '));
		if (node.update) push_array(chunks, handle(node.update, state));

		chunks.push(c(') '));
		push_array(chunks, handle(node.body, state));

		return chunks;
	},

	ForInStatement: shared['ForInStatement|ForOfStatement'],

	ForOfStatement: shared['ForInStatement|ForOfStatement'],

	FunctionDeclaration: shared['FunctionDeclaration|FunctionExpression'],

	FunctionExpression: shared['FunctionDeclaration|FunctionExpression'],

	Identifier(node) {
		let name = node.name;
		return [c(name, node)];
	},

	IfStatement(node, state) {
		const chunks = [
			c('if ('),
			...handle(node.test, state),
			c(') '),
			...handle(node.consequent, state)
		];

		if (node.alternate) {
			chunks.push(c(' else '));
			push_array(chunks, handle(node.alternate, state));
		}

		return chunks;
	},

	ImportDeclaration(node, state) {
		const chunks = [c('import ')];

		const { length } = node.specifiers;
		const source = handle(node.source, state);

		if (length > 0) {
			let i = 0;

			while (i < length) {
				if (i > 0) {
					chunks.push(c(', '));
				}

				const specifier = node.specifiers[i];

				if (specifier.type === 'ImportDefaultSpecifier') {
					chunks.push(c(specifier.local.name, specifier));
					i += 1;
				} else if (specifier.type === 'ImportNamespaceSpecifier') {
					chunks.push(c('* as ' + specifier.local.name, specifier));
					i += 1;
				} else {
					break;
				}
			}

			if (i < length) {
				// we have named specifiers
				const specifiers = /** @type {import('estree').ImportSpecifier[]} */ (node.specifiers)
					.slice(i)
					.map((specifier) => {
						const name = handle(specifier.imported, state)[0];
						const as = handle(specifier.local, state)[0];

						if (name.content === as.content) {
							return [as];
						}

						return [name, c(' as '), as];
					});

				const width =
					get_length(chunks) +
					specifiers.map(get_length).reduce(sum, 0) +
					2 * specifiers.length +
					6 +
					get_length(source);

				if (width > 80) {
					chunks.push(c(`{\n\t`));
					push_array(chunks, join(specifiers, c(',\n\t')));
					chunks.push(c('\n}'));
				} else {
					chunks.push(c(`{ `));
					push_array(chunks, join(specifiers, c(', ')));
					chunks.push(c(' }'));
				}
			}

			chunks.push(c(' from '));
		}

		push_array(chunks, source);
		chunks.push(c(';'));

		return chunks;
	},

	ImportExpression(node, state) {
		return [c('import('), ...handle(node.source, state), c(')')];
	},

	LabeledStatement(node, state) {
		return [...handle(node.label, state), c(': '), ...handle(node.body, state)];
	},

	Literal(node, state) {
		if (typeof node.value === 'string') {
			return [
				// TODO do we need to handle weird unicode characters somehow?
				// str.replace(/\\u(\d{4})/g, (m, n) => String.fromCharCode(+n))
				c(node.raw || JSON.stringify(node.value), node)
			];
		}

		return [c(node.raw || String(node.value), node)];
	},

	LogicalExpression: shared['BinaryExpression|LogicalExpression'],

	MemberExpression(node, state) {
		/**
		 * @type any[]
		 */
		const chunks = [];

		if (EXPRESSIONS_PRECEDENCE[node.object.type] < EXPRESSIONS_PRECEDENCE.MemberExpression) {
			chunks.push(c('('));
			push_array(chunks, handle(node.object, state));
			chunks.push(c(')'));
		} else {
			push_array(chunks, handle(node.object, state));
		}

		if (node.computed) {
			if (node.optional) {
				chunks.push(c('?.'));
			}
			chunks.push(c('['));
			push_array(chunks, handle(node.property, state));
			chunks.push(c(']'));
		} else {
			chunks.push(c(node.optional ? '?.' : '.'));
			push_array(chunks, handle(node.property, state));
		}

		return chunks;
	},

	MetaProperty(node, state) {
		return [...handle(node.meta, state), c('.'), ...handle(node.property, state)];
	},

	MethodDefinition(node, state) {
		const chunks = [];

		if (node.static) {
			chunks.push(c('static '));
		}

		if (node.kind === 'get' || node.kind === 'set') {
			// Getter or setter
			chunks.push(c(node.kind + ' '));
		}

		if (node.value.async) {
			chunks.push(c('async '));
		}

		if (node.value.generator) {
			chunks.push(c('*'));
		}

		if (node.computed) {
			chunks.push(c('['));
			push_array(chunks, handle(node.key, state));
			chunks.push(c(']'));
		} else {
			push_array(chunks, handle(node.key, state));
		}

		chunks.push(c('('));

		const { params } = node.value;
		for (let i = 0; i < params.length; i += 1) {
			push_array(chunks, handle(params[i], state));
			if (i < params.length - 1) chunks.push(c(', '));
		}

		chunks.push(c(') '));
		push_array(chunks, handle(node.value.body, state));

		return chunks;
	},

	NewExpression(node, state) {
		const chunks = [c('new ')];

		if (
			EXPRESSIONS_PRECEDENCE[node.callee.type] < EXPRESSIONS_PRECEDENCE.CallExpression ||
			has_call_expression(node.callee)
		) {
			chunks.push(c('('));
			push_array(chunks, handle(node.callee, state));
			chunks.push(c(')'));
		} else {
			push_array(chunks, handle(node.callee, state));
		}

		// TODO this is copied from CallExpression — DRY it out
		const args = node.arguments.map((arg) =>
			handle(arg, {
				...state,
				indent: state.indent + '\t'
			})
		);

		const separator = args.some(has_newline) // TODO or length exceeds 80
			? c(',\n' + state.indent)
			: c(', ');

		chunks.push(c('('));
		push_array(chunks, join(args, separator));
		chunks.push(c(')'));

		return chunks;
	},

	ObjectExpression(node, state) {
		if (node.properties.length === 0) {
			return [c('{}')];
		}

		let has_inline_comment = false;

		/** @type {import('./types').Chunk[]} */
		const chunks = [];
		const separator = c(', ');

		node.properties.forEach((p, i) => {
			push_array(
				chunks,
				handle(p, {
					...state,
					indent: state.indent + '\t'
				})
			);

			if (state.comments.length) {
				// TODO generalise this, so it works with ArrayExpressions and other things.
				// At present, stuff will just get appended to the closest statement/declaration
				chunks.push(c(', '));

				while (state.comments.length) {
					const comment = /** @type {import('estree').Comment} */ (state.comments.shift());

					chunks.push(
						c(
							comment.type === 'Block'
								? `/*${comment.value}*/\n${state.indent}\t`
								: `//${comment.value}\n${state.indent}\t`
						)
					);

					if (comment.type === 'Line') {
						has_inline_comment = true;
					}
				}
			} else {
				if (i < node.properties.length - 1) {
					chunks.push(separator);
				}
			}
		});

		const multiple_lines = has_inline_comment || has_newline(chunks) || get_length(chunks) > 40;

		if (multiple_lines) {
			separator.content = `,\n${state.indent}\t`;
		}

		return [
			c(multiple_lines ? `{\n${state.indent}\t` : `{ `),
			...chunks,
			c(multiple_lines ? `\n${state.indent}}` : ` }`)
		];
	},

	ObjectPattern(node, state) {
		const chunks = [c('{ ')];

		for (let i = 0; i < node.properties.length; i += 1) {
			push_array(chunks, handle(node.properties[i], state));
			if (i < node.properties.length - 1) chunks.push(c(', '));
		}

		chunks.push(c(' }'));

		return chunks;
	},

	// @ts-expect-error this isn't a real node type, but Acorn produces it
	ParenthesizedExpression(node, state) {
		return handle(node.expression, state);
	},

	PrivateIdentifier(node, state) {
		const chunks = [c('#')];

		push_array(chunks, [c(node.name, node)]);

		return chunks;
	},

	Program(node, state) {
		return handle_body(node.body, state);
	},

	Property(node, state) {
		const value = handle(node.value, state);

		if (node.key === node.value) {
			return value;
		}

		// special case
		if (
			!node.computed &&
			node.value.type === 'AssignmentPattern' &&
			node.value.left.type === 'Identifier' &&
			node.key.type === 'Identifier' &&
			node.value.left.name === node.key.name
		) {
			return value;
		}

		if (
			!node.computed &&
			node.value.type === 'Identifier' &&
			((node.key.type === 'Identifier' && node.key.name === value[0].content) ||
				(node.key.type === 'Literal' && node.key.value === value[0].content))
		) {
			return value;
		}

		const key = handle(node.key, state);

		if (node.value.type === 'FunctionExpression' && !node.value.id) {
			const chunks = node.kind !== 'init' ? [c(`${node.kind} `)] : [];

			if (node.value.async) {
				chunks.push(c('async '));
			}
			if (node.value.generator) {
				chunks.push(c('*'));
			}

			push_array(chunks, node.computed ? [c('['), ...key, c(']')] : key);
			chunks.push(c('('));
			push_array(
				chunks,
				join(
					node.value.params.map((param) => handle(param, state)),
					c(', ')
				)
			);
			chunks.push(c(') '));
			push_array(chunks, handle(node.value.body, state));

			return chunks;
		}

		if (node.computed) {
			return [c('['), ...key, c(']: '), ...value];
		}

		return [...key, c(': '), ...value];
	},

	PropertyDefinition(node, state) {
		const chunks = [];

		if (node.static) {
			chunks.push(c('static '));
		}

		if (node.computed) {
			chunks.push(c('['), ...handle(node.key, state), c(']'));
		} else {
			chunks.push(...handle(node.key, state));
		}

		if (node.value) {
			chunks.push(c(' = '));

			chunks.push(...handle(node.value, state));
		}

		chunks.push(c(';'));

		return chunks;
	},

	RestElement: shared['RestElement|SpreadElement'],

	ReturnStatement(node, state) {
		if (node.argument) {
			const contains_comment =
				node.argument.leadingComments &&
				node.argument.leadingComments.some(
					(/** @type {any} */ comment) => comment.has_trailing_newline
				);
			return [
				c(contains_comment ? 'return (' : 'return '),
				...handle(node.argument, state),
				c(contains_comment ? ');' : ';')
			];
		} else {
			return [c('return;')];
		}
	},

	SequenceExpression(node, state) {
		const expressions = node.expressions.map((e) => handle(e, state));

		return [c('('), ...join(expressions, c(', ')), c(')')];
	},

	SpreadElement: shared['RestElement|SpreadElement'],

	StaticBlock(node, state) {
		return [
			c('static '),
			c(`{\n${state.indent}\t`),
			...handle_body(node.body, { ...state, indent: state.indent + '\t' }),
			c(`\n${state.indent}}`)
		];
	},

	Super(node, state) {
		return [c('super', node)];
	},

	SwitchStatement(node, state) {
		const chunks = [c('switch ('), ...handle(node.discriminant, state), c(') {')];

		node.cases.forEach((block) => {
			if (block.test) {
				chunks.push(c(`\n${state.indent}\tcase `));
				push_array(chunks, handle(block.test, { ...state, indent: `${state.indent}\t` }));
				chunks.push(c(':'));
			} else {
				chunks.push(c(`\n${state.indent}\tdefault:`));
			}

			block.consequent.forEach((statement) => {
				chunks.push(c(`\n${state.indent}\t\t`));
				push_array(chunks, handle(statement, { ...state, indent: `${state.indent}\t\t` }));
			});
		});

		chunks.push(c(`\n${state.indent}}`));

		return chunks;
	},

	TaggedTemplateExpression(node, state) {
		return handle(node.tag, state).concat(handle(node.quasi, state));
	},

	TemplateLiteral(node, state) {
		const chunks = [c('`')];

		const { quasis, expressions } = node;

		for (let i = 0; i < expressions.length; i++) {
			chunks.push(c(quasis[i].value.raw), c('${'));
			push_array(chunks, handle(expressions[i], state));
			chunks.push(c('}'));
		}

		chunks.push(c(quasis[quasis.length - 1].value.raw), c('`'));

		return chunks;
	},

	ThisExpression(node, state) {
		return [c('this', node)];
	},

	ThrowStatement(node, state) {
		return [c('throw '), ...handle(node.argument, state), c(';')];
	},

	TryStatement(node, state) {
		const chunks = [c('try '), ...handle(node.block, state)];

		if (node.handler) {
			if (node.handler.param) {
				chunks.push(c(' catch('));
				push_array(chunks, handle(node.handler.param, state));
				chunks.push(c(') '));
			} else {
				chunks.push(c(' catch '));
			}

			push_array(chunks, handle(node.handler.body, state));
		}

		if (node.finalizer) {
			chunks.push(c(' finally '));
			push_array(chunks, handle(node.finalizer, state));
		}

		return chunks;
	},

	UnaryExpression(node, state) {
		const chunks = [c(node.operator)];

		if (node.operator.length > 1) {
			chunks.push(c(' '));
		}

		if (EXPRESSIONS_PRECEDENCE[node.argument.type] < EXPRESSIONS_PRECEDENCE.UnaryExpression) {
			chunks.push(c('('));
			push_array(chunks, handle(node.argument, state));
			chunks.push(c(')'));
		} else {
			push_array(chunks, handle(node.argument, state));
		}

		return chunks;
	},

	UpdateExpression(node, state) {
		return node.prefix
			? [c(node.operator), ...handle(node.argument, state)]
			: [...handle(node.argument, state), c(node.operator)];
	},

	VariableDeclaration(node, state) {
		return handle_var_declaration(node, state).concat(c(';'));
	},

	VariableDeclarator(node, state) {
		if (node.init) {
			return [...handle(node.id, state), c(' = '), ...handle(node.init, state)];
		} else {
			return handle(node.id, state);
		}
	},

	WhileStatement(node, state) {
		return [c('while ('), ...handle(node.test, state), c(') '), ...handle(node.body, state)];
	},

	WithStatement(node, state) {
		return [c('with ('), ...handle(node.object, state), c(') '), ...handle(node.body, state)];
	},

	YieldExpression(node, state) {
		if (node.argument) {
			return [c(node.delegate ? `yield* ` : `yield `), ...handle(node.argument, state)];
		}

		return [c(node.delegate ? `yield*` : `yield`)];
	}
};
