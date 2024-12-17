type Generic<T> = { data: T };

const n: Generic<number> = { data: 1 };
const s: Generic<string> = { data: 'foo' };
const b: Generic<boolean> = { data: true };

function foo(np: Generic<number>) {
	console.log(np.data);
}

function bar(np: Generic<number>): Generic<boolean> {
	return { data: true };
}

function barTypeof(np: Generic<typeof n>): Generic<boolean> {
	return { data: true };
}

type DoubleGeneric<K, V> = { key: K; value: V };

function foobar(np: DoubleGeneric<number, string>): DoubleGeneric<boolean, string> {
	return { key: true, value: 'foo' };
}