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
  return cards
    .map(
      (c) =>
        `${c.name} | ${c.manaCost} | ${c.typeLine} | ${c.rarity} | ${c.oracleText.slice(0, 120)}`,
    )
    .join("\n");
}

function buildPrompt(cards: Card[], setName: string): string {
  return `You are an expert Magic: The Gathering limited/sealed deck builder. You are analyzing a sealed pool from the ${setName} prerelease.

## Pool (${cards.length} cards)
${formatPool(cards)}

## Task
Build the best possible 40-card sealed deck from this pool. You must:

1. **Analyze** the pool — identify bombs, removal, key synergies, and color depth
2. **Choose colors** — pick the best 2-color pair (or splash if a bomb demands it), explain why
3. **Build the deck** — select exactly 23 non-land cards for the main deck
4. **Suggest lands** — recommend basic land counts (17 total lands)
5. **Commentary** — brief notes on the deck's game plan, strengths, weaknesses, and key cards

## Response Format
Respond ONLY with this JSON (no markdown fences, no extra text):
{"analysis":"2-3 sentence overview of pool quality","colors":{"primary":"W or U or B or R or G","secondary":"W or U or B or R or G","splash":null,"reasoning":"why these colors"},"mainDeck":["Card Name","Card Name"],"basics":{"W":0,"U":0,"B":0,"R":0,"G":0},"commentary":{"gameplan":"1-2 sentences","strengths":"1-2 sentences","weaknesses":"1-2 sentences","keyCards":["Card Name — why important","Card Name — why"],"mulliganGuide":"1 sentence"}}`;
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

  const proc = spawn(CLAUDE_BIN, ["-p", "--verbose", "--output-format", "stream-json"], {
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
