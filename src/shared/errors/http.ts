import { AppError, isExpectedError } from '.';

export function errorToResponse(err: unknown): Response {
  if (isExpectedError(err)) {
    return jsonResponse(err.httpStatus, { code: err.code, message: err.message });
  }
  if (err instanceof AppError) {
    return jsonResponse(err.httpStatus, {
      code: 'INTERNAL_ERROR',
      message: 'Ha ocurrido un error interno. Inténtalo de nuevo.',
    });
  }
  return jsonResponse(500, {
    code: 'INTERNAL_ERROR',
    message: 'Ha ocurrido un error interno. Inténtalo de nuevo.',
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
