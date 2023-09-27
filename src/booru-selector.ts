import inquirer from "inquirer";
import Booru from "./booru/index.js";
import { boorus } from "./boorus.js";

export default async function selectBoorus(): Promise<Booru[]> {
  const { selectedBoorus } = await inquirer.prompt({
    type: "checkbox",
    name: "selectedBoorus",
    message: "Boorus",
    choices: boorus.map((booru) => ({
      name: booru.name,
      value: booru,
      checked: true,
    })),
    validate: (input: Booru[]): boolean => Boolean(input.length),
  });

  return selectedBoorus;
}
