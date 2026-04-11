export function successResponse(data: unknown, message: string) {
  return {
    success: true,
    message,
    data
  };
}

export function errorResponse(message: string, errors?: string[]) {
  return {
    success: false,
    message,
    errors
  };
}