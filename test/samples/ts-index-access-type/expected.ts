type A = { a: string; b: number };
type B = A['b'];

const c: A['b'] = 1;