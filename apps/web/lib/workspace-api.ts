export async function workspaceRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 429)
      throw new Error("För många försök. Vänta en stund och försök igen.");
    const message = Array.isArray(data.message) ? data.message.join(" ") : data.message;
    throw new Error(message ?? "Åtgärden kunde inte genomföras.");
  }
  return data as T;
}
