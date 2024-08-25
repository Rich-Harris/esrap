const a: number = 42;
const b = a as unknown as string;

type C = {
	name: string;
};

type D = {
	firstName: string;
};

const e: C = {
	name: 'foo'
} as unknown as D;
