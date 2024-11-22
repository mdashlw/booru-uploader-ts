import { checkbox } from "@inquirer/prompts";
import Booru from "./booru/index.ts";
import { boorus } from "./boorus.ts";

export default async function selectBoorus(): Promise<Booru[]> {
  // const selectedBoorus = await checkbox({
  //   message: "Boorus",
  //   choices: boorus.map((booru, index) => ({
  //     value: booru,
  //     name: booru.name,
  //     checked: index === 0,
  //   })),
  //   required: true,
  // });

  // return selectedBoorus;
  return [boorus[0]];
}
