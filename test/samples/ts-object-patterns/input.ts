type User = {
	firstName: string;
	lastName: string;
};

function a({ firstName, lastName }: User) {
	console.log(firstName, lastName);
}
