import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/types';

type NodeOf<T extends string, X> = X extends { type: T } ? X : never;

type Handler<T> = (node: T, state: State) => undefined;

export type Handlers = {
	[K in AST_NODE_TYPES]: Handler<NodeOf<K, TSESTree.Node>>;
};

// `@typescript-eslint/types` differs from the official `estree` spec by handling
// comments differently. This is a node which we can use to ensure type saftey.
export type NodeWithComments = {
	leadingComments?: TSESTree.Comment[] | undefined;
	trailingComments?: TSESTree.Comment[] | undefined;
} & TSESTree.Node;

export interface State {
	commands: Command[];
	comments: TSESTree.Comment[];
	multiline: boolean;
}

export interface Chunk {
	type: 'Chunk';
	content: string;
	loc: null | {
		start: { line: number; column: number };
		end: { line: number; column: number };
	};
}

export interface Newline {
	type: 'Newline';
}

export interface Indent {
	type: 'Indent';
}

export interface Dedent {
	type: 'Dedent';
}

export interface IndentChange {
	type: 'IndentChange';
	offset: number;
}

export interface Sequence {
	type: 'Sequence';
	children: Command[];
}

export interface CommentChunk {
	type: 'Comment';
	comment: TSESTree.Comment;
}

export type Command = string | Chunk | Newline | Indent | Dedent | Sequence | CommentChunk;
