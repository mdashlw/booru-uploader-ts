import { checkbox } from "@inquirer/prompts";
import Booru from "./booru/index.js";
import { boorus } from "./boorus.js";

export default async function selectBoorus(): Promise<Booru[]> {
  const selectedBoorus = await checkbox({
    message: "Boorus",
    choices: boorus.map((booru) => ({
      value: booru,
      name: booru.name,
      checked: true,
    })),
    required: true,
  });

  return selectedBoorus;
}
