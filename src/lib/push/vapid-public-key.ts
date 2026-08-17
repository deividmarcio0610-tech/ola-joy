// Chave pública VAPID — pode ser exposta ao cliente com segurança.
// A chave privada correspondente vive apenas no backend (VAPID_PRIVATE_KEY).
// Rotacionada em 2026-08-12: a chave privada do par anterior nunca esteve no .env de
// produção, então nenhum push chegou a ser entregue. O par novo vive em VAPID_PRIVATE_KEY.
// Assinaturas criadas com a chave antiga precisam ser refeitas pelo botão de ativar push.
export const VAPID_PUBLIC_KEY =
  "BAbqatpwV1rsQ2ndh7RqWWftBITNybuzQmPTzleLE2HWukNuhHWjX21XEgMQs6032wsImb1MsQ6B4_sxJLEB394";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output;
}
