enum UserResponse {
	No = 0,
	Yes = 1
}

function respond(recipient: string, message: UserResponse): void {
	// ...
}

respond('Princess Caroline', UserResponse.Yes);
