import { DateTime } from "luxon";
import { z } from "zod";

export const ZodLuxonDateTime = z
  .string()
  .datetime({ offset: true })
  .transform((value) => DateTime.fromISO(value, { setZone: true }))
  .refine(
    (dt) => dt.isValid,
    (dt) => ({ message: `Invalid datetime: ${dt.invalidExplanation}` }),
  );
