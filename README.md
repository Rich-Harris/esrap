# esrap

Parse in reverse. AST goes in, code comes out.

## Usage

```js
import { print } from 'esrap';

const { code, map } = print({
  type: 'Program',
  body: [
    {
      type: 'ExpressionStatement',
      expression: {
        callee: {
          type: 'Identifier',
          name: 'alert'
        },
        arguments: [
          {
            type: 'Literal',
            value: 'hello world!'
          }
        ]
      }
    }
  ]
});

console.log(code); // alert('hello world!');
```

If the nodes of the input AST have `loc` properties (e.g. the AST was generated with [`acorn`](https://github.com/acornjs/acorn/tree/master/acorn/#interface) with the `locations` option set), sourcemap mappings will be created.

## Options

You can optionally pass information that will be used while generating the output (note that the AST is assumed to come from a single file):

```js
const { code, map } = print(ast, {
  sourceMapSource: 'input.js',
  sourceMapContent: fs.readFileSync('input.js', 'utf-8'),
  indent: ' ', // default '\t'
  quotes: 'single' // or 'double', default 'single'
});
```

The `quotes` option is only used for string literals where no raw value was provided. In most cases this means that the ast node was added by manipulating the ast. This avoid's unnecessarily transforming the provided source code.

## TypeScript

`esrap` can also print TypeScript nodes, assuming they match the ESTree-like [`@typescript-eslint/types`](https://www.npmjs.com/package/@typescript-eslint/types).

## Why not just use Prettier?

Because it's ginormous.

## Developing

This repo uses [pnpm](https://pnpm.io). Once it's installed, do `pnpm install` to install dependencies, and `pnpm test` to run the tests.

## License

[MIT](LICENSE)
