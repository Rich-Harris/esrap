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

If the nodes of the input AST have `start` and `end` properties, sourcemap mappings will be created.

## Why not just use Prettier?

Because it's ginormous.

## License

[MIT](LICENSE)
