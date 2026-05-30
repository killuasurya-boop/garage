import { ZodError, type ZodSchema } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ data }, init);
}

export function fail(status: number, code: string, message: string) {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export async function readJson<T>(request: Request, schema: ZodSchema<T>) {
  try {
    const payload = await request.json();
    return { data: schema.parse(payload), error: null as null };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        data: null,
        error: fail(
          400,
          "VALIDATION_ERROR",
          error.issues.map((issue) => issue.message).join("; "),
        ),
      };
    }

    return {
      data: null,
      error: fail(400, "INVALID_JSON", "Request body must be valid JSON."),
    };
  }
}
