import { z } from "zod";

export const CardStatusSchema = z.enum(["ok", "error", "partial"]);
export type CardStatus = z.infer<typeof CardStatusSchema>;

export const CardResultSchema = z.object({
  taskId: z.string().min(1),
  status: CardStatusSchema,
  filesChanged: z.array(z.string()),
  verify: z.object({
    typecheck: z.boolean().optional(),
    tests: z.boolean().optional(),
    notes: z.string().optional(),
  }),
  outputs: z.record(z.string(), z.string()),
});

export type CardResult = z.infer<typeof CardResultSchema>;

export type BuildCardResultInput = {
  taskId: string;
  status: CardStatus;
  filesChanged: string[];
  verify?: CardResult["verify"];
  outputs?: Record<string, string>;
};

export function buildCardResult(input: BuildCardResultInput): CardResult {
  return CardResultSchema.parse({
    taskId: input.taskId,
    status: input.status,
    filesChanged: [...input.filesChanged],
    verify: { notes: "local scrape", ...input.verify },
    outputs: { ...input.outputs },
  });
}

export function parseCardResult(value: unknown): CardResult {
  return CardResultSchema.parse(value);
}
