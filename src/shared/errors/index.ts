export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DomainError extends AppError { readonly httpStatus = 422; }
export class ValidationError extends AppError { readonly httpStatus = 400; }
export class NotFoundError extends AppError { readonly httpStatus = 404; }
export class AuthorizationError extends AppError { readonly httpStatus = 403; }
export class AuthenticationError extends AppError { readonly httpStatus = 401; }
export class ConflictError extends AppError { readonly httpStatus = 409; }
export class RateLimitError extends AppError { readonly httpStatus = 429; }
export class InvalidTokenError extends AppError { readonly httpStatus = 400; }
export class InfrastructureError extends AppError { readonly httpStatus = 500; }

export function isExpectedError(err: unknown): err is AppError {
  return (
    err instanceof DomainError ||
    err instanceof ValidationError ||
    err instanceof NotFoundError ||
    err instanceof AuthorizationError ||
    err instanceof AuthenticationError ||
    err instanceof ConflictError ||
    err instanceof RateLimitError ||
    err instanceof InvalidTokenError
  );
}
