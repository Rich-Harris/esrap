type A = string;
const b: number = 42 satisfies A;

type C = {
	name: string;
};

type D = {
	name: string;
	description: string;
};

const e: D = {
	name: 'foo',
	desciption: 'bar'
};

const f = e satisfies D;

const g = (
	Math.random() > 0.5
		? { name: 'name1', description: 'desc1' }
		: { name: 'name2', description: 'desc2' }
) satisfies D;
