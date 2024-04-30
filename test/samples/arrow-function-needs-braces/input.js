let a = () => ({ x } = { x: 42 });
let b = () => ({} || bar);
let c = () => ({} ? foo : bar);