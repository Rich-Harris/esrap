import { expect, test } from 'bun:test';
import fs from 'node:fs';
import { parse } from 'acorn';
import { print } from '../src/index.js';

for (const dir of fs.readdirSync(`${__dirname}/samples`)) {
	if (dir[0] === '.') continue;

	test(dir, async () => {
		// TODO use input.js
		const input = await Bun.file(`${__dirname}/samples/${dir}/expected.js`).text();
		const expected = await Bun.file(`${__dirname}/samples/${dir}/expected.js`).text();

		const ast = parse(input, {
			ecmaVersion: 'latest',
			sourceType: dir === 'with' ? 'script' : 'module'
		});

		const { code, map } = print(ast);

		expect(code).toBe(expected);
	});
}
