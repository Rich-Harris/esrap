type A = string;

const b: number = 42 satisfies A;

type C = { name: string };
type D = { name: string; description: string };

const e: D = { name: 'foo', desciption: 'bar' };
const f = e satisfies D;