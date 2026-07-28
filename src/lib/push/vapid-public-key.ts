// Chave pública VAPID — pode ser exposta ao cliente com segurança.
// A chave privada correspondente vive apenas no backend (VAPID_PRIVATE_KEY).
export const VAPID_PUBLIC_KEY =
  "BAMkZix9yy3GHdKDwK4d17QkK77p8MNGrX6J6bP6W82fCsUjrRFl01a5TwmSJWQZWXTJ11eVrnteAGPzNSWImM8";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output;
}
