import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { transcribeWavBase64 } from "./stt.server";

export const transcribeChunk = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        wavBase64: z.string().min(64),
        language: z.string().min(2).max(5).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const result = await transcribeWavBase64(data.wavBase64, data.language);
      return { ok: true as const, ...result };
    } catch (err: unknown) {
      return {
        ok: false as const,
        text: "",
        error: String((err as Error)?.message ?? err),
        model: "",
        bytes: 0,
        serverMs: 0,
      };
    }
  });
