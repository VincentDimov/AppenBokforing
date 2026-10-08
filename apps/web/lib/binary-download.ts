export async function downloadBinary(url: string, name: string, signal?: AbortSignal) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", signal });
  if (!response.ok) {
    let message = "Filen kunde inte exporteras.";
    try {
      const error = await response.json();
      if (typeof error.message === "string") message = error.message;
    } catch {
      /* no raw infrastructure output */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  if (signal?.aborted) return;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
export function bytesBase64(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}
