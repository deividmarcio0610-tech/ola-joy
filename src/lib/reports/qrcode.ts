import QRCode from "qrcode";

export async function qrDataURL(text: string, size = 160): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      color: { dark: "#0a0f1c", light: "#ffffff" },
    });
  } catch {
    return "";
  }
}
