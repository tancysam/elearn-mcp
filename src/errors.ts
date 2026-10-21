export class ElearnError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ElearnError";
  }
}

export class AuthenticationRequiredError extends ElearnError {
  constructor(message = "SMU eLearn authentication is required. Run `npm run auth` in the elearn-mcp directory.") {
    super(message, "AUTHENTICATION_REQUIRED", 401);
    this.name = "AuthenticationRequiredError";
  }
}

export class NotFoundError extends ElearnError {
  constructor(message: string, details?: unknown) {
    super(message, "NOT_FOUND", 404, details);
    this.name = "NotFoundError";
  }
}
