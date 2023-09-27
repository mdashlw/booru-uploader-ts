import process from "node:process";
import undici from "undici";

const URL = process.env.INTERMEDIARY_DISCORD_WEBHOOK_URL;

export default async function getIntermediateImageUrl(
  blob: any,
): Promise<string> {
  const formData = new undici.FormData();

  formData.append(
    "payload_json",
    JSON.stringify({
      attachments: [{ id: 0 }],
    }),
  );
  formData.append("files[0]", blob, "image.png");

  const response = await undici.fetch(`${URL}?wait=true`, {
    method: "POST",
    body: formData,
  });
  const data: any = await response.json();

  return data.attachments[0].url;
}
