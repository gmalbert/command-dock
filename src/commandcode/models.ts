export interface ModelInfo {
  id: string;
  label: string;
  description: string;
  provider: string;
  capabilities: string[];
}

export function parseModelList(output: string): ModelInfo[] {
  let provider = "CommandCode";
  const models: ModelInfo[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (
      !line.trim() ||
      /^(Available models|Pass the full id|cmdc --model|Docs:)/.test(
        line.trim(),
      )
    )
      continue;
    if (!/^\s/.test(rawLine) && /^[A-Za-z][A-Za-z ]+$/.test(line.trim())) {
      provider = line.trim();
      continue;
    }
    const match = line
      .trim()
      .match(/^([A-Za-z0-9][A-Za-z0-9._/-]+)\s{2,}(.+)$/);
    if (!match) continue;
    const id = match[1]!;
    const description = match[2]!.trim();
    models.push({
      id,
      label: humanizeModelId(id),
      description,
      provider,
      capabilities: inferCapabilities(description),
    });
  }
  return deduplicate(models);
}

export function humanizeModelId(id: string): string {
  return id
    .split("/")
    .at(-1)!
    .split("-")
    .map((part) => {
      if (/^\d+(?:\.\d+)*$/.test(part)) return part;
      return part.length <= 3
        ? part.toUpperCase()
        : `${part[0]!.toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

function inferCapabilities(description: string): string[] {
  const value = description.toLowerCase();
  return [
    /vision|multimodal/.test(value) && "vision",
    /fast|speed|throughput|latency/.test(value) && "fast",
    /long|1m|million/.test(value) && "long-context",
    /agent/.test(value) && "agentic",
    /free/.test(value) && "free",
  ].filter((item): item is string => Boolean(item));
}

function deduplicate(models: ModelInfo[]): ModelInfo[] {
  return [
    ...new Map(models.map((model) => [model.id.toLowerCase(), model])).values(),
  ];
}
