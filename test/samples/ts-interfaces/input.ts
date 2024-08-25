interface Test {
	func: (a: string) => Promise<void>;
	func2: () => Promise<void>;
	a: number;
	b: boolean;
}

interface IndexSignature {
	[key: string]: string;
}

class Control {
	private state: any;
}

interface SelectableControl extends Control {
	select(): void;
}

class Button extends Control implements SelectableControl {
	select() {}
}

class TextBox extends Control {
	select() {}
}
