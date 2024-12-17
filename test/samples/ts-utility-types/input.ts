type A = Awaited<Promise<string>>;

type Todo = {
	title: string;
	description: string;
};

function updateTodo(todo: Todo, fieldsToUpdate: Partial<Todo>) {
	return { ...todo, ...fieldsToUpdate };
}

const todo2: Readonly<Todo> = {
	title: 'Delete inactive users',
	description: 'foo'
};

type CatInfo = {
	age: number;
	breed: string;
};

const cats: Record<string, CatInfo> = {
	miffy: { age: 10, breed: 'Persian' },
	boris: { age: 5, breed: 'Maine Coon' },
	mordred: { age: 16, breed: 'British Shorthair' }
};
