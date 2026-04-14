import http from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 3078);
const CLAUDE_BIN = process.env.CLAUDE_BIN || `${process.env.HOME}/.npm-global/bin/claude`;

interface Card {
  name: string;
  rarity: string;
  colors: string[];
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
}

function formatPool(cards: Card[]): string {
  // Group by rarity for compact display
  const byRarity = new Map<string, Card[]>();
  for (const c of cards) {
    const r = c.rarity;
    if (!byRarity.has(r)) byRarity.set(r, []);
    byRarity.get(r)!.push(c);
  }

  const lines: string[] = [];
  for (const [rarity, group] of byRarity) {
    lines.push(`[${rarity.toUpperCase()}]`);
    for (const c of group) {
      // Compact: name, cost, type, and short oracle text for rares/mythics only
      const oracle = (rarity === "rare" || rarity === "mythic")
        ? ` | ${c.oracleText.slice(0, 80)}`
        : "";
      lines.push(`${c.name} | ${c.manaCost} | ${c.typeLine}${oracle}`);
    }
  }
  return lines.join("\n");
}

function buildPrompt(cards: Card[], setName: string): string {
  return `You are an expert MTG sealed deck builder. Analyze this ${setName} prerelease pool and build the best 40-card deck.

## Pool (${cards.length} cards)
${formatPool(cards)}

## Instructions
Pick the best 2-color pair (splash if a bomb demands it). Select exactly 23 non-land spells + 17 lands (suggest basic land split). Be concise.

Respond ONLY with JSON, no markdown fences:
{"analysis":"2-3 sentences on pool quality","colors":{"primary":"W/U/B/R/G","secondary":"W/U/B/R/G","splash":null,"reasoning":"why"},"mainDeck":["Card Name","Card Name"],"basics":{"W":0,"U":0,"B":0,"R":0,"G":0},"commentary":{"gameplan":"1-2 sentences","strengths":"1 sentence","weaknesses":"1 sentence","keyCards":["Card — why","Card — why"],"mulliganGuide":"1 sentence"}}`;
}

async function handleAnalyze(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  let body = "";
  for await (const chunk of req) body += chunk;

  let parsed: { cards: Card[]; setName: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  if (!parsed.cards?.length) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No cards provided" }));
    return;
  }

  const prompt = buildPrompt(parsed.cards, parsed.setName);

  // Stream response via SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send keepalives so Cloudflare doesn't timeout the connection
  res.write(`: connected\n\n`);
  const keepalive = setInterval(() => {
    res.write(`: keepalive\n\n`);
  }, 10000);

  const proc = spawn(CLAUDE_BIN, ["-p", "--verbose", "--output-format", "stream-json", "--model", "haiku"], {
    env: { ...process.env, PATH: `${process.env.HOME}/.npm-global/bin:${process.env.PATH}` },
  });

  proc.stdin.write(prompt);
  proc.stdin.end();

  let buffer = "";

  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);

        // Stream assistant message content as it arrives
        if (event.type === "assistant" && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === "text" && block.text) {
              res.write(`data: ${JSON.stringify({ text: block.text })}\n\n`);
            }
          }
        }

        // Final result
        if (event.type === "result" && event.result) {
          res.write(`data: ${JSON.stringify({ result: event.result })}\n\n`);
        }
      } catch {
        // incomplete JSON, skip
      }
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    console.error("claude stderr:", chunk.toString());
  });

  proc.on("close", (code) => {
    clearInterval(keepalive);
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer);
        if (event.type === "result" && event.result) {
          res.write(`data: ${JSON.stringify({ result: event.result })}\n\n`);
        }
      } catch {
        // ignore
      }
    }
    if (code !== 0) {
      res.write(`data: ${JSON.stringify({ error: `claude exited with code ${code}` })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  });

  proc.on("error", (err) => {
    console.error("spawn error:", err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });

  // Clean up if client disconnects
  req.on("close", () => {
    clearInterval(keepalive);
    proc.kill();
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/analyze-pool") {
    handleAnalyze(req, res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`MTG API server listening on http://127.0.0.1:${PORT}`);
});
