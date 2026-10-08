// Reads a newline-delimited JSON response body, calling onMessage for each parsed line.
export async function readNdjson<T>(res: Response, onMessage: (msg: T) => void) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) onMessage(JSON.parse(line) as T);
  }
}
