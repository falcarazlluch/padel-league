import { describe, it, expect } from 'vitest';
import { errorToResponse } from '@/shared/errors/http';
import { DomainError, InfrastructureError } from '@/shared/errors';

describe('errorToResponse', () => {
  it('maps DomainError to 422 JSON body', async () => {
    const res = errorToResponse(new DomainError('MATCH_NOT_VALID', 'bad'));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: 'MATCH_NOT_VALID', message: 'bad' });
  });

  it('maps unknown to InfrastructureError 500 with generic message', async () => {
    const res = errorToResponse(new Error('db exploded'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).not.toContain('db exploded');
  });

  it('maps InfrastructureError to 500 with generic message', async () => {
    const res = errorToResponse(new InfrastructureError('DB_DOWN', 'connect timeout'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).not.toContain('connect timeout');
  });
});
