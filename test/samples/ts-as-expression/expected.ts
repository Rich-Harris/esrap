const a: number = 42;
const b = a as unknown as string;

type C = { name: string };
type D = { firstName: string };

const e: C = { name: 'foo' } as unknown as D;
const f = (Math.random() > 0.5 ? { firstName: 'name1' } : { firstName: 'name2' }) as unknown as D;