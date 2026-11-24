// Test doubles for unit tests. They stand in for Express request and response objects, so a middleware
// can run without a server.

export function fakeResponse() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    headersSent: false,
    locals: {} as Record<string, unknown>,
    status: jest.fn(),
    set: jest.fn(),
    json: jest.fn(),
    end: jest.fn(),
  };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.set.mockImplementation((headers: Record<string, string>) => {
    Object.assign(res.headers, headers);
    return res;
  });
  res.json.mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  res.end.mockImplementation(() => res);
  return res;
}

// Runs fn and returns what it threw, or undefined if it did not throw.
export function captureThrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
