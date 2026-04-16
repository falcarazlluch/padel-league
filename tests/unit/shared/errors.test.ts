import { describe, it, expect } from 'vitest';
import {
  AppError,
  DomainError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
  ConflictError,
  RateLimitError,
  InvalidTokenError,
  InfrastructureError,
} from '@/shared/errors';

describe('AppError hierarchy', () => {
  it('DomainError has code and 422', () => {
    const e = new DomainError('MATCH_NOT_VALID', 'Bad sets');
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe('MATCH_NOT_VALID');
    expect(e.httpStatus).toBe(422);
  });

  it.each([
    [ValidationError, 400],
    [NotFoundError, 404],
    [AuthorizationError, 403],
    [AuthenticationError, 401],
    [ConflictError, 409],
    [RateLimitError, 429],
    [InvalidTokenError, 400],
    [InfrastructureError, 500],
  ])('%s maps to %d', (Cls, status) => {
    const e = new Cls('CODE', 'msg');
    expect(e.httpStatus).toBe(status);
    expect(e).toBeInstanceOf(AppError);
  });

  it('captures context', () => {
    const e = new NotFoundError('USER_NOT_FOUND', 'No user', { userId: '123' });
    expect(e.context).toEqual({ userId: '123' });
  });

  it('is distinguishable via instanceof', () => {
    const e = new ValidationError('X', 'x');
    expect(e instanceof AppError).toBe(true);
    expect(e instanceof DomainError).toBe(false);
  });
});
