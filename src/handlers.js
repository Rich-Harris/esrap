// heavily based on https://github.com/davidbonnet/astring
// released under MIT license https://github.com/davidbonnet/astring/blob/master/LICENSE

/** @type {import('./types').Newline} */
const newline = { type: 'Newline' };

/** @type {import('./types').Indent} */
const indent = { type: 'Indent' };

/** @type {import('./types').Dedent} */
const dedent = { type: 'Dedent' };

/**
 * @param {import('./types').Command[]} children
 * @returns {import('./types').Sequence}
 */
function sequence(...children) {
	return { type: 'Sequence', children };
}

/**
 * Rough estimate of the combined width of a group of commands
 * @param {import('./types').Command[]} commands
 * @param {number} from
 * @param {number} to
 */
function measure(commands, from, to = commands.length) {
	let total = 0;
	for (let i = from; i < to; i += 1) {
		const command = commands[i];
		if (typeof command === 'string') {
			total += command.length;
		} else if (command.type === 'Chunk') {
			total += command.content.length;
		} else if (command.type === 'Sequence') {
			// assume this is ', '
			total += 2;
		}
	}

	return total;
}

/**
 * @param {import('estree').Node} node
 * @param {import('./types').State} state
 */
export function handle(node, state) {
	const handler = handlers[node.type];

	if (!handler) {
		throw new Error(`Not implemented ${node.type}`);
	}

	if (node.leadingComments) {
		prepend_comments(node.leadingComments, state);
	}

	// @ts-expect-error
	handler(node, state);

	if (node.trailingComments) {
		state.comments.push(node.trailingComments[0]); // there is only ever one
	}
}

/**
 * @param {string} content
 * @param {import('estree').Node} [node]
 * @returns {import('./types').Chunk}
 */
function c(content, node) {
	return {
		type: 'Chunk',
		content,
		loc: node?.loc ?? null
	};
}

/**
 * @param {import('estree').Comment[]} comments
 * @param {import('./types').State} state
 */
function prepend_comments(comments, state) {
	for (const comment of comments) {
		state.commands.push(comment.type === 'Block' ? `/*${comment.value}*/` : `//${comment.value}`);

		// @ts-expect-error TODO this is non-standard and weird
		if (comment.has_trailing_newline) {
			state.commands.push(newline);
		} else {
			state.commands.push(' ');
		}
	}
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
	const join = sequence(newline);

	let last_statement = /** @type {import('estree').Node} */ ({ type: 'EmptyStatement' });
	let first = true;
	let margin_bottom = false;

	for (const statement of nodes) {
		if (statement.type === 'EmptyStatement') continue;

		const margin = sequence();

		if (!first) state.commands.push(margin, join);
		first = false;

		const leadingComments = statement.leadingComments;
		delete statement.leadingComments;

		if (leadingComments && leadingComments.length > 0) {
			prepend_comments(leadingComments, state);
		}

		const child_state = { ...state, multiline: false };
		handle(statement, child_state);

		if (
			child_state.multiline ||
			margin_bottom ||
			((grouped_expression_types.includes(statement.type) ||
				grouped_expression_types.includes(last_statement.type)) &&
				last_statement.type !== statement.type)
		) {
			margin.children.push('\n');
		}

		margin_bottom = child_state.multiline;

		// while (state.comments.length) {
		// 	const comment = /** @type {import('estree').Comment} */ (state.comments.shift());
		// 	const prefix = add_newline ? `\n${state.indent}` : ` `;

		// 	state.commands.push(
		// 		c(
		// 			comment.type === 'Block' ? `${prefix}/*${comment.value}*/` : `${prefix}//${comment.value}`
		// 		)
		// 	);

		// 	add_newline = comment.type === 'Line';
		// }

		last_statement = statement;
	}
};

/**
 * @param {import('estree').VariableDeclaration} node
 * @param {import('./types').State} state
 */
const handle_var_declaration = (node, state) => {
	const index = state.commands.length;

	const open = sequence();
	const join = sequence();
	const child_state = { ...state, multiline: false };

	state.commands.push(`${node.kind} `, open);

	let first = true;

	for (const d of node.declarations) {
		if (!first) state.commands.push(join);
		first = false;

		handle(d, child_state);
	}

	const multiline = child_state.multiline || measure(state.commands, index) > 50;

	if (multiline) {
		state.multiline = true;
		if (node.declarations.length > 1) open.children.push(indent);
		join.children.push(',', newline);
		if (node.declarations.length > 1) state.commands.push(dedent);
	} else {
		join.children.push(', ');
	}
};

const shared = {
	/**
	 * @param {import('estree').ArrayExpression | import('estree').ArrayPattern} node
	 * @param {import('./types').State} state
	 */
	'ArrayExpression|ArrayPattern': (node, state) => {
		if (node.elements.length === 0) {
			state.commands.push('[]');
			return;
		}

		const child_state = { ...state, multiline: false };

		const open = sequence();
		const join = sequence();
		const close = sequence();

		state.commands.push('[', open);

		let sparse_commas = '';

		for (let i = 0; i < node.elements.length; i += 1) {
			const element = node.elements[i];
			if (element) {
				state.commands.push(sparse_commas);

				if (i > 0) {
					state.commands.push(join);
				}

				handle(element, child_state);
				sparse_commas = '';
			} else {
				sparse_commas += ',';
			}
		}

		state.commands.push(sparse_commas, close);

		const multiline = child_state.multiline || node.elements.length > 3; // TODO

		if (multiline) {
			state.multiline = true;

			open.children.push(indent, newline);
			join.children.push(',', newline);
			close.children.push(dedent, newline);
		} else {
			join.children.push(', ');
		}

		// const multiple_lines =
		// 	elements.some(has_newline) ||
		// 	elements.map(get_length).reduce(sum, 0) + (state.indent.length + elements.length - 1) * 2 >
		// 		80;

		// if (multiple_lines) {
		// 	chunks.push(c(`\n${state.indent}\t`));
		// 	push_array(chunks, join(elements, c(`,\n${state.indent}\t`)));
		// 	chunks.push(c(`\n${state.indent}`));
		// 	push_array(chunks, sparse_commas);
		// } else {
		// 	push_array(chunks, join(elements, c(', ')));
		// 	push_array(chunks, sparse_commas);
		// }

		state.commands.push(']');
	},

	/**
	 * @param {import('estree').BinaryExpression | import('estree').LogicalExpression} node
	 * @param {import('./types').State} state
	 */
	'BinaryExpression|LogicalExpression': (node, state) => {
		// TODO
		// const is_in = node.operator === 'in';
		// if (is_in) {
		// 	// Avoids confusion in `for` loops initializers
		// 	chunks.push(c('('));
		// }

		if (needs_parens(node.left, node, false)) {
			state.commands.push('(');
			handle(node.left, state);
			state.commands.push(')');
		} else {
			handle(node.left, state);
		}

		state.commands.push(` ${node.operator} `);

		if (needs_parens(node.right, node, true)) {
			state.commands.push('(');
			handle(node.right, state);
			state.commands.push(')');
		} else {
			handle(node.right, state);
		}
	},

	/**
	 * @param {import('estree').BlockStatement | import('estree').ClassBody} node
	 * @param {import('./types').State} state
	 */
	'BlockStatement|ClassBody': (node, state) => {
		if (node.body.length === 0) {
			state.commands.push('{}');
			return;
		}

		state.multiline = true;

		state.commands.push(indent, '{', newline);
		handle_body(node.body, state);
		state.commands.push(dedent, newline, '}');
	},

	/**
	 * @param {import('estree').CallExpression | import('estree').NewExpression} node
	 * @param {import('./types').State} state
	 */
	'CallExpression|NewExpression': (node, state) => {
		const index = state.commands.length;

		if (node.type === 'NewExpression') {
			state.commands.push('new ');
		}

		const needs_parens =
			EXPRESSIONS_PRECEDENCE[node.callee.type] < EXPRESSIONS_PRECEDENCE.CallExpression ||
			(node.type === 'NewExpression' && has_call_expression(node.callee));

		if (needs_parens) {
			state.commands.push('(');
			handle(node.callee, state);
			state.commands.push(')');
		} else {
			handle(node.callee, state);
		}

		if (node.type === 'NewExpression' && node.arguments.length === 0) return;

		if (/** @type {import('estree').SimpleCallExpression} */ (node).optional) {
			state.commands.push('?.');
		}

		const open = sequence();
		const join = sequence();
		const close = sequence();

		state.commands.push('(', open);

		// if the final argument is multiline, it doesn't need to force all the
		// other arguments to also be multiline
		const child_state = { ...state, multiline: false };
		const final_state = { ...state, multiline: false };

		for (let i = 0; i < node.arguments.length; i += 1) {
			if (i > 0) state.commands.push(join);
			const p = node.arguments[i];

			handle(p, i === node.arguments.length - 1 ? final_state : child_state);
		}

		state.commands.push(close, ')');

		const multiline = child_state.multiline || measure(state.commands, index) > 50;

		if (multiline || final_state.multiline) {
			state.multiline = true;
		}

		if (multiline) {
			open.children.push(indent, newline);
			join.children.push(',', newline);
			close.children.push(dedent, newline);
		} else {
			join.children.push(', ');
		}
	},

	/**
	 * @param {import('estree').ClassDeclaration | import('estree').ClassExpression} node
	 * @param {import('./types').State} state
	 */
	'ClassDeclaration|ClassExpression': (node, state) => {
		state.commands.push('class ');

		if (node.id) {
			handle(node.id, state);
			state.commands.push(' ');
		}

		if (node.superClass) {
			state.commands.push('extends ');
			handle(node.superClass, state);
			state.commands.push(' ');
		}

		handle(node.body, state);
	},

	/**
	 * @param {import('estree').ForInStatement | import('estree').ForOfStatement} node
	 * @param {import('./types').State} state
	 */
	'ForInStatement|ForOfStatement': (node, state) => {
		state.commands.push('for ');
		if (node.type === 'ForOfStatement' && node.await) state.commands.push('await ');
		state.commands.push('(');

		if (node.left.type === 'VariableDeclaration') {
			handle_var_declaration(node.left, state);
		} else {
			handle(node.left, state);
		}

		state.commands.push(node.type === 'ForInStatement' ? ` in ` : ` of `);
		handle(node.right, state);
		state.commands.push(') ');
		handle(node.body, state);
	},

	/**
	 * @param {import('estree').FunctionDeclaration | import('estree').FunctionExpression} node
	 * @param {import('./types').State} state
	 */
	'FunctionDeclaration|FunctionExpression': (node, state) => {
		const index = state.commands.length;

		if (node.async) state.commands.push(c('async '));
		state.commands.push(c(node.generator ? 'function* ' : 'function '));
		if (node.id) handle(node.id, state);

		const open = sequence();
		const join = sequence();
		const close = sequence();

		state.commands.push('(', open);

		const child_state = { ...state, multiline: false };

		for (let i = 0; i < node.params.length; i += 1) {
			if (i > 0) state.commands.push(join);
			handle(node.params[i], state);
		}

		state.commands.push(close, ') ');

		const multiline = child_state.multiline || measure(state.commands, index) > 50;

		if (multiline) {
			state.multiline = true;

			open.children.push(indent, newline);
			join.children.push(',', newline);
			close.children.push(dedent, newline);
		} else {
			join.children.push(', ');
		}

		handle(node.body, state);
	},

	/**
	 * @param {import('estree').RestElement | import('estree').SpreadElement} node
	 * @param {import('./types').State} state
	 */
	'RestElement|SpreadElement': (node, state) => {
		state.commands.push('...');
		handle(node.argument, state);
	}
};

/** @type {import('./types').Handlers} */
const handlers = {
	ArrayExpression: shared['ArrayExpression|ArrayPattern'],

	ArrayPattern: shared['ArrayExpression|ArrayPattern'],

	ArrowFunctionExpression: (node, state) => {
		if (node.async) state.commands.push(c('async '));

		if (node.params.length === 1 && node.params[0].type === 'Identifier') {
			handle(node.params[0], state);
		} else {
			state.commands.push('(');

			let first = true;

			for (const p of node.params) {
				if (first) {
					first = false;
				} else {
					state.commands.push(', ');
				}

				handle(p, state);
			}

			state.commands.push(')');
		}

		state.commands.push(' => ');

		if (
			node.body.type === 'ObjectExpression' ||
			(node.body.type === 'AssignmentExpression' && node.body.left.type === 'ObjectPattern')
		) {
			state.commands.push('(');
			handle(node.body, state);
			state.commands.push(')');
		} else {
			handle(node.body, state);
		}
	},

	AssignmentExpression(node, state) {
		handle(node.left, state);
		state.commands.push(` ${node.operator} `);
		handle(node.right, state);
	},

	AssignmentPattern(node, state) {
		handle(node.left, state);
		state.commands.push(' = ');
		handle(node.right, state);
	},

	AwaitExpression(node, state) {
		if (node.argument) {
			const precedence = EXPRESSIONS_PRECEDENCE[node.argument.type];

			if (precedence && precedence < EXPRESSIONS_PRECEDENCE.AwaitExpression) {
				state.commands.push('await (');
				handle(node.argument, state);
				state.commands.push(')');
			} else {
				state.commands.push('await ');
				handle(node.argument, state);
			}
		}

		return [c('await')];
	},

	BinaryExpression: shared['BinaryExpression|LogicalExpression'],

	BlockStatement: shared['BlockStatement|ClassBody'],

	BreakStatement(node, state) {
		if (node.label) {
			state.commands.push('break ');
			handle(node.label, state);
			state.commands.push(';');
		} else {
			state.commands.push('break;');
		}
	},

	CallExpression: shared['CallExpression|NewExpression'],

	ChainExpression(node, state) {
		return handle(node.expression, state);
	},

	ClassBody: shared['BlockStatement|ClassBody'],

	ClassDeclaration: shared['ClassDeclaration|ClassExpression'],

	ClassExpression: shared['ClassDeclaration|ClassExpression'],

	ConditionalExpression(node, state) {
		if (EXPRESSIONS_PRECEDENCE[node.test.type] > EXPRESSIONS_PRECEDENCE.ConditionalExpression) {
			handle(node.test, state);
		} else {
			state.commands.push('(');
			handle(node.test, state);
			state.commands.push(')');
		}

		const if_true = sequence();
		const if_false = sequence();

		const child_state = { ...state, multiline: false };

		state.commands.push(if_true);
		handle(node.consequent, child_state);
		state.commands.push(if_false);
		handle(node.alternate, child_state);

		const multiline = child_state.multiline;

		if (multiline) {
			if_true.children.push(indent, newline, '? ');
			if_false.children.push(newline, ': ');
		} else {
			if_true.children.push(' ? ');
			if_false.children.push(' : ');
		}
	},

	ContinueStatement(node, state) {
		if (node.label) {
			state.commands.push('continue ');
			handle(node.label, state);
			state.commands.push(';');
		} else {
			state.commands.push('continue;');
		}
	},

	DebuggerStatement(node, state) {
		return [c('debugger', node), c(';')];
	},

	DoWhileStatement(node, state) {
		state.commands.push('do ');
		handle(node.body, state);
		state.commands.push(' while (');
		handle(node.test, state);
		state.commands.push(');');
	},

	EmptyStatement(node, state) {
		state.commands.push(';');
	},

	ExportAllDeclaration(node, state) {
		state.commands.push('export * from ');
		handle(node.source, state);
		state.commands.push(';');
	},

	ExportDefaultDeclaration(node, state) {
		state.commands.push('export default ');

		handle(node.declaration, state);

		if (node.declaration.type !== 'FunctionDeclaration') {
			state.commands.push(';');
		}
	},

	ExportNamedDeclaration(node, state) {
		state.commands.push('export ');

		if (node.declaration) {
			handle(node.declaration, state);
			return;
		}

		if (node.specifiers.length === 0) {
			state.commands.push('{};');
			return;
		}

		const open = sequence();
		const join = sequence();
		const close = sequence();

		state.commands.push('{', open);

		let first = true;
		let width = 9;

		for (const s of node.specifiers) {
			if (!first) state.commands.push(join);
			first = false;

			if (s.local.name === s.exported.name) {
				handle(s.local, state);
				width += s.local.name.length;
			} else {
				handle(s.local, state);
				state.commands.push(' as ');
				handle(s.exported, state);
				width += s.local.name.length + 4 + s.exported.name.length;
			}
		}

		if (node.source) {
			state.commands.push(' from ');
			handle(node.source, state);

			width += 8 + /** @type {string} */ (node.source.value).length;
		}

		const multiline = false; // TODO

		if (multiline) {
			state.multiline = true;

			open.children.push(indent, newline);
			join.children.push(',', newline);
			close.children.push(dedent, newline);
		} else {
			open.children.push(' ');
			join.children.push(', ');
			close.children.push(' ');
		}

		state.commands.push(close, '};');
	},

	ExpressionStatement(node, state) {
		if (
			node.expression.type === 'AssignmentExpression' &&
			node.expression.left.type === 'ObjectPattern'
		) {
			// is an AssignmentExpression to an ObjectPattern
			state.commands.push('(');
			handle(node.expression, state);
			state.commands.push(');');
		}

		handle(node.expression, state);
		state.commands.push(';');
	},

	ForStatement: (node, state) => {
		state.commands.push('for (');

		if (node.init) {
			if (node.init.type === 'VariableDeclaration') {
				handle_var_declaration(node.init, state);
			} else {
				handle(node.init, state);
			}
		}

		state.commands.push('; ');
		if (node.test) handle(node.test, state);
		state.commands.push('; ');
		if (node.update) handle(node.update, state);

		state.commands.push(') ');
		handle(node.body, state);
	},

	ForInStatement: shared['ForInStatement|ForOfStatement'],

	ForOfStatement: shared['ForInStatement|ForOfStatement'],

	FunctionDeclaration: shared['FunctionDeclaration|FunctionExpression'],

	FunctionExpression: shared['FunctionDeclaration|FunctionExpression'],

	Identifier(node, state) {
		let name = node.name;
		state.commands.push(c(name, node));
	},

	IfStatement(node, state) {
		state.commands.push('if (');
		handle(node.test, state);
		state.commands.push(') ');
		handle(node.consequent, state);

		if (node.alternate) {
			state.commands.push(' else ');
			handle(node.alternate, state);
		}
	},

	ImportDeclaration(node, state) {
		if (node.specifiers.length === 0) {
			state.commands.push('import ');
			handle(node.source, state);
			state.commands.push(';');
			return;
		}

		/** @type {import('estree').ImportNamespaceSpecifier | null} */
		let namespace_specifier = null;

		/** @type {import('estree').ImportDefaultSpecifier | null} */
		let default_specifier = null;

		/** @type {import('estree').ImportSpecifier[]} */
		const named_specifiers = [];

		for (const s of node.specifiers) {
			if (s.type === 'ImportNamespaceSpecifier') {
				namespace_specifier = s;
			} else if (s.type === 'ImportDefaultSpecifier') {
				default_specifier = s;
			} else {
				named_specifiers.push(s);
			}
		}

		const index = state.commands.length;

		state.commands.push('import ');

		if (namespace_specifier) {
			state.commands.push(c('* as ' + namespace_specifier.local.name, namespace_specifier));
		}

		if (default_specifier) {
			state.commands.push(c(default_specifier.local.name, default_specifier));
		}

		if (named_specifiers.length > 0) {
			if (default_specifier) state.commands.push(', ');

			const open = sequence();
			const join = sequence();
			const close = sequence();

			let first = true;

			state.commands.push('{', open);
			for (const s of named_specifiers) {
				if (!first) state.commands.push(join);
				first = false;

				if (s.local.name === s.imported.name) {
					state.commands.push(c(s.local.name, s.local));
				} else {
					state.commands.push(c(s.imported.name, s.imported), ' as ', c(s.local.name, s.local));
				}
			}

			state.commands.push(close, '}');

			const multiline = measure(state.commands, index) > 50;

			if (multiline) {
				open.children.push(indent, newline);
				join.children.push(',', newline);
				close.children.push(dedent, newline);
			} else {
				open.children.push(' ');
				join.children.push(', ');
				close.children.push(' ');
			}
		}

		state.commands.push(' from ');
		handle(node.source, state);
		state.commands.push(';');
	},

	ImportExpression(node, state) {
		state.commands.push('import(');
		handle(node.source, state);
		state.commands.push(')');
	},

	LabeledStatement(node, state) {
		handle(node.label, state);
		state.commands.push(': ');
		handle(node.body, state);
	},

	Literal(node, state) {
		let value;

		if (typeof node.value === 'string') {
			// TODO do we need to handle weird unicode characters somehow?
			// str.replace(/\\u(\d{4})/g, (m, n) => String.fromCharCode(+n))
			value = node.raw ?? JSON.stringify(node.value);
			if (/\n/.test(value)) state.multiline = true;
		} else {
			value = node.raw ?? String(node.value);
		}

		state.commands.push(c(value, node));
	},

	LogicalExpression: shared['BinaryExpression|LogicalExpression'],

	MemberExpression(node, state) {
		if (EXPRESSIONS_PRECEDENCE[node.object.type] < EXPRESSIONS_PRECEDENCE.MemberExpression) {
			state.commands.push('(');
			handle(node.object, state);
			state.commands.push(')');
		} else {
			handle(node.object, state);
		}

		if (node.computed) {
			if (node.optional) {
				state.commands.push('?.');
			}
			state.commands.push('[');
			handle(node.property, state);
			state.commands.push(']');
		} else {
			state.commands.push(node.optional ? '?.' : '.');
			handle(node.property, state);
		}
	},

	MetaProperty(node, state) {
		handle(node.meta, state);
		state.commands.push('.');
		handle(node.property, state);
	},

	MethodDefinition(node, state) {
		if (node.static) {
			state.commands.push('static ');
		}

		if (node.kind === 'get' || node.kind === 'set') {
			// Getter or setter
			state.commands.push(node.kind + ' ');
		}

		if (node.value.async) {
			state.commands.push('async ');
		}

		if (node.value.generator) {
			state.commands.push('*');
		}

		if (node.computed) state.commands.push('[');
		handle(node.key, state);
		if (node.computed) state.commands.push(']');

		state.commands.push('(');

		let first = true;

		for (const p of node.value.params) {
			if (!first) state.commands.push(', ');
			first = false;

			handle(p, state);
		}

		state.commands.push(') ');
		handle(node.value.body, state);
	},

	NewExpression: shared['CallExpression|NewExpression'],

	ObjectExpression(node, state) {
		const index = state.commands.length;

		if (node.properties.length === 0) {
			state.commands.push('{}');
			return;
		}

		const open = sequence();
		const join = sequence();
		const close = sequence();

		state.commands.push('{', open);

		const child_state = { ...state, multiline: false };

		let first = true;
		for (const p of node.properties) {
			if (!first) state.commands.push(join);
			first = false;

			if (p.type === 'Property' && p.value.type === 'FunctionExpression') {
				const fn = /** @type {import('estree').FunctionExpression} */ (p.value);

				if (p.kind === 'get' || p.kind === 'set') {
					state.commands.push(p.kind + ' ');
				} else {
					if (fn.async) state.commands.push('async ');
					if (fn.generator) state.commands.push('*');
				}

				if (p.computed) state.commands.push('[');
				handle(p.key, child_state);
				if (p.computed) state.commands.push(']');
				state.commands.push('(');

				for (let i = 0; i < fn.params.length; i += 1) {
					if (i > 0) state.commands.push(', ');
					handle(fn.params[i], child_state);
				}

				state.commands.push(') ');
				handle(fn.body, child_state);
			} else {
				handle(p, child_state);
			}
		}

		state.commands.push(close, '}');

		const multiline = child_state.multiline || measure(state.commands, index) > 50;

		if (multiline) {
			state.multiline = true;

			open.children.push(indent, newline);
			join.children.push(',', newline);
			close.children.push(dedent, newline);
		} else {
			open.children.push(' ');
			join.children.push(', ');
			close.children.push(' ');
		}

		return;

		// node.properties.forEach((p, i) => {
		// 	handle(p, state);

		// 	if (state.comments.length) {
		// 		// TODO generalise this, so it works with ArrayExpressions and other things.
		// 		// At present, stuff will just get appended to the closest statement/declaration
		// 		chunks.push(c(', '));

		// 		while (state.comments.length) {
		// 			const comment = /** @type {import('estree').Comment} */ (state.comments.shift());

		// 			chunks.push(
		// 				c(
		// 					comment.type === 'Block'
		// 						? `/*${comment.value}*/\n${state.indent}\t`
		// 						: `//${comment.value}\n${state.indent}\t`
		// 				)
		// 			);

		// 			if (comment.type === 'Line') {
		// 				has_inline_comment = true;
		// 			}
		// 		}
		// 	} else {
		// 		if (i < node.properties.length - 1) {
		// 			chunks.push(separator);
		// 		}
		// 	}
		// });

		// const multiple_lines = has_inline_comment || has_newline(chunks) || get_length(chunks) > 40;

		// if (multiple_lines) {
		// 	separator.content = `,\n${state.indent}\t`;
		// }

		// return [
		// 	c(multiple_lines ? `{\n${state.indent}\t` : `{ `),
		// 	...chunks,
		// 	c(multiple_lines ? `\n${state.indent}}` : ` }`)
		// ];
	},

	ObjectPattern(node, state) {
		state.commands.push('{ ');

		for (let i = 0; i < node.properties.length; i += 1) {
			handle(node.properties[i], state);
			if (i < node.properties.length - 1) state.commands.push(c(', '));
		}

		state.commands.push(' }');
	},

	// @ts-expect-error this isn't a real node type, but Acorn produces it
	ParenthesizedExpression(node, state) {
		return handle(node.expression, state);
	},

	PrivateIdentifier(node, state) {
		state.commands.push('#', c(node.name, node));
	},

	Program(node, state) {
		return handle_body(node.body, state);
	},

	Property(node, state) {
		const value = node.value.type === 'AssignmentPattern' ? node.value.left : node.value;

		const shorthand =
			!node.computed &&
			node.kind === 'init' &&
			node.key.type === 'Identifier' &&
			value.type === 'Identifier' &&
			node.key.name === value.name;

		if (shorthand) {
			handle(node.value, state);
			return;
		}

		if (node.computed) state.commands.push('[');
		handle(node.key, state);
		state.commands.push(node.computed ? ']: ' : ': ');
		handle(node.value, state);
	},

	PropertyDefinition(node, state) {
		if (node.static) {
			state.commands.push('static ');
		}

		if (node.computed) {
			state.commands.push('[');
			handle(node.key, state);
			state.commands.push(']');
		} else {
			handle(node.key, state);
		}

		if (node.value) {
			state.commands.push(' = ');

			handle(node.value, state);
		}

		state.commands.push(';');
	},

	RestElement: shared['RestElement|SpreadElement'],

	ReturnStatement(node, state) {
		if (node.argument) {
			const contains_comment =
				node.argument.leadingComments &&
				node.argument.leadingComments.some(
					(/** @type {any} */ comment) => comment.has_trailing_newline
				);

			state.commands.push(contains_comment ? 'return (' : 'return ');
			handle(node.argument, state);
			state.commands.push(contains_comment ? ');' : ';');
		} else {
			state.commands.push('return;');
		}
	},

	SequenceExpression(node, state) {
		state.commands.push('(');

		let first = true;

		for (const e of node.expressions) {
			if (!first) state.commands.push(', ');
			first = false;

			handle(e, state);
		}

		state.commands.push(')');
	},

	SpreadElement: shared['RestElement|SpreadElement'],

	StaticBlock(node, state) {
		state.commands.push(indent, 'static {', newline);

		handle_body(node.body, state);

		state.commands.push(dedent, newline, '}');
	},

	Super(node, state) {
		return [c('super', node)];
	},

	SwitchStatement(node, state) {
		state.commands.push('switch (');
		handle(node.discriminant, state);
		state.commands.push(') {', indent);

		let first = true;

		for (const block of node.cases) {
			if (!first) state.commands.push('\n');
			first = false;

			if (block.test) {
				state.commands.push(newline, `case `);
				handle(block.test, state);
				state.commands.push(':');
			} else {
				state.commands.push(newline, `default:`);
			}

			state.commands.push(indent);

			for (const statement of block.consequent) {
				state.commands.push(newline);
				handle(statement, state);
			}

			state.commands.push(dedent);
		}

		state.commands.push(dedent, `\n}`);
	},

	TaggedTemplateExpression(node, state) {
		handle(node.tag, state);
		handle(node.quasi, state);
	},

	TemplateLiteral(node, state) {
		state.commands.push('`');

		const { quasis, expressions } = node;

		for (let i = 0; i < expressions.length; i++) {
			const raw = quasis[i].value.raw;

			state.commands.push(raw, '${');
			handle(expressions[i], state);
			state.commands.push('}');

			if (/\n/.test(raw)) state.multiline = true;
		}

		const raw = quasis[quasis.length - 1].value.raw;

		state.commands.push(raw, '`');
		if (/\n/.test(raw)) state.multiline = true;
	},

	ThisExpression(node, state) {
		state.commands.push(c('this', node));
	},

	ThrowStatement(node, state) {
		state.commands.push('throw ');
		handle(node.argument, state);
		state.commands.push(';');
	},

	TryStatement(node, state) {
		state.commands.push('try ');
		handle(node.block, state);

		if (node.handler) {
			if (node.handler.param) {
				state.commands.push(' catch(');
				handle(node.handler.param, state);
				state.commands.push(') ');
			} else {
				state.commands.push(' catch ');
			}

			handle(node.handler.body, state);
		}

		if (node.finalizer) {
			state.commands.push(' finally ');
			handle(node.finalizer, state);
		}
	},

	UnaryExpression(node, state) {
		state.commands.push(node.operator);

		if (node.operator.length > 1) {
			state.commands.push(c(' '));
		}

		if (EXPRESSIONS_PRECEDENCE[node.argument.type] < EXPRESSIONS_PRECEDENCE.UnaryExpression) {
			state.commands.push('(');
			handle(node.argument, state);
			state.commands.push(')');
		} else {
			handle(node.argument, state);
		}
	},

	UpdateExpression(node, state) {
		if (node.prefix) {
			state.commands.push(node.operator);
			handle(node.argument, state);
		} else {
			handle(node.argument, state);
			state.commands.push(node.operator);
		}
	},

	VariableDeclaration(node, state) {
		handle_var_declaration(node, state);
		state.commands.push(';');
	},

	VariableDeclarator(node, state) {
		handle(node.id, state);

		if (node.init) {
			state.commands.push(' = ');
			handle(node.init, state);
		}
	},

	WhileStatement(node, state) {
		state.commands.push('while (');
		handle(node.test, state);
		state.commands.push(') ');
		handle(node.body, state);
	},

	WithStatement(node, state) {
		state.commands.push('with (');
		handle(node.object, state);
		state.commands.push(') ');
		handle(node.body, state);
	},

	YieldExpression(node, state) {
		if (node.argument) {
			state.commands.push(node.delegate ? `yield* ` : `yield `);
			handle(node.argument, state);
		} else {
			state.commands.push(node.delegate ? `yield*` : `yield`);
		}
	}
};
