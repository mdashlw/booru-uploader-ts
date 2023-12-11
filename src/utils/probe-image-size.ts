import probe from "probe-image-size";
import undici from "undici";

export default async function probeImageSize(
  url: string | URL,
): Promise<probe.ProbeResult> {
  const ac = new AbortController();
  const response = await undici.request(url, {
    signal: ac.signal,
    reset: true,
    throwOnError: true,
    maxRedirections: 1,
  });

  const probeResult = await probe(response.body).finally(() => {
    ac.abort();
  });

  return {
    ...probeResult,
    url: (response.context as { history: URL[] }).history.at(-1)!.href,
  };
}
