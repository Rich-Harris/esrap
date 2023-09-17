import { Comment, Node } from 'estree';

type NodeOf<T extends string, X> = X extends { type: T } ? X : never;

type Handler<T> = (node: T, state: State) => Chunk[];

export type Handlers = {
	[K in Node['type']]: Handler<NodeOf<K, Node>>;
};

export interface State {
	indent: string;
	comments: Comment[];
}

export interface Chunk {
	content: string;
	loc: null | {
		start: { line: number; column: number };
		end: { line: number; column: number };
	};
	has_newline: boolean;
}
