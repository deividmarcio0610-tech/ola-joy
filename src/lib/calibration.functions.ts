import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { readPriceScaleWithVision } from "@/services/ai/vision";

const Input = z.object({
  imageDataUrl: z.string().min(100).max(3_000_000),
  frameHeight: z.number().int().min(100).max(4000),
});

export const calibratePriceScale = createServerFn({ method: "POST" })
  .validator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => readPriceScaleWithVision(data.imageDataUrl, data.frameHeight));
