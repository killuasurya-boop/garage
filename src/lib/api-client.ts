import type { ApiEnvelope } from "@/lib/garage-api-types";

export class GarageApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, options: { code?: string; status?: number } = {}) {
    super(message);
    this.name = "GarageApiError";
    this.code = options.code ?? "GARAGE_API_ERROR";
    this.status = options.status ?? 500;
  }
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    throw new GarageApiError("API returned an invalid JSON response.", {
      code: "INVALID_JSON_RESPONSE",
      status: response.status,
    });
  }
}

async function request<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined;

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    credentials: init.credentials ?? "same-origin",
    headers,
  });
  const envelope = await parseEnvelope<T>(response);

  if (!response.ok || envelope.error) {
    throw new GarageApiError(
      envelope.error?.message ?? `Garage API request failed: ${response.status}`,
      {
        code: envelope.error?.code,
        status: response.status,
      },
    );
  }

  if (!("data" in envelope)) {
    throw new GarageApiError("Garage API response is missing data.", {
      code: "MISSING_DATA",
      status: response.status,
    });
  }

  return envelope.data as T;
}

export const garageApi = {
  get<T>(path: string, init?: RequestInit) {
    return request<T>(path, {
      ...init,
      method: "GET",
    });
  },
  post<T, TBody = unknown>(path: string, body: TBody, init?: RequestInit) {
    return request<T>(path, {
      ...init,
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  put<T, TBody = unknown>(path: string, body: TBody, init?: RequestInit) {
    return request<T>(path, {
      ...init,
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  patch<T, TBody = unknown>(path: string, body: TBody, init?: RequestInit) {
    return request<T>(path, {
      ...init,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  delete<T>(path: string, init?: RequestInit) {
    return request<T>(path, {
      ...init,
      method: "DELETE",
    });
  },
};
