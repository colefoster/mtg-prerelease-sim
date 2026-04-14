import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiAnalysis } from "../lib/ai";
import { heuristicAnalyzePool, claudeAnalyzePool } from "../lib/ai";
import type { DeckState, PoolCard } from "../types";

const COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const COLOR_DOTS: Record<string, string> = {
  W: "bg-ctp-yellow",
  U: "bg-ctp-blue",
  B: "bg-ctp-overlay0",
  R: "bg-ctp-red",
  G: "bg-ctp-green",
};

function AnalysisDisplay({
  result,
  onApply,
  label,
}: {
  result: AiAnalysis;
  onApply: () => void;
  label: string;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-ctp-subtext1 leading-relaxed">
        {result.analysis}
      </div>

      <div className="bg-ctp-base/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-3 h-3 rounded-full ${COLOR_DOTS[result.colors.primary]}`} />
          <span className={`w-3 h-3 rounded-full ${COLOR_DOTS[result.colors.secondary]}`} />
          {result.colors.splash && (
            <>
              <span className="text-[10px] text-ctp-overlay0">+</span>
              <span className={`w-2.5 h-2.5 rounded-full ${COLOR_DOTS[result.colors.splash]}`} />
            </>
          )}
          <span className="text-xs font-medium text-ctp-text">
            {COLOR_NAMES[result.colors.primary]}-{COLOR_NAMES[result.colors.secondary]}
            {result.colors.splash ? ` (splash ${COLOR_NAMES[result.colors.splash]})` : ""}
          </span>
        </div>
        <p className="text-xs text-ctp-overlay1">{result.colors.reasoning}</p>
      </div>

      <div className="space-y-2 text-xs">
        <div>
          <span className="font-semibold text-ctp-subtext1">Game plan: </span>
          <span className="text-ctp-overlay1">{result.commentary.gameplan}</span>
        </div>
        <div>
          <span className="font-semibold text-ctp-green">Strengths: </span>
          <span className="text-ctp-overlay1">{result.commentary.strengths}</span>
        </div>
        <div>
          <span className="font-semibold text-ctp-red">Weaknesses: </span>
          <span className="text-ctp-overlay1">{result.commentary.weaknesses}</span>
        </div>
        <div>
          <span className="font-semibold text-ctp-peach">Mulligan: </span>
          <span className="text-ctp-overlay1">{result.commentary.mulliganGuide}</span>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-ctp-subtext0 mb-1">Key Cards</h4>
        <ul className="space-y-0.5">
          {result.commentary.keyCards.map((note, i) => (
            <li key={i} className="text-xs text-ctp-overlay1">
              <span className="text-ctp-mauve">•</span> {note}
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onApply}
        className="w-full text-sm py-2 rounded-lg bg-ctp-mauve text-ctp-crust font-semibold hover:bg-ctp-lavender transition-colors"
      >
        {label} ({result.mainDeck.length} cards + {Object.values(result.basics).reduce((a, b) => a + b, 0)} basics)
      </button>
    </div>
  );
}

interface Props {
  deck: DeckState;
  setName: string;
  onApplyBuild: (mainNames: string[], basics: DeckState["basics"]) => void;
}

export function AiPanel({ deck, setName, onApplyBuild }: Props) {
  const [tab, setTab] = useState<"heuristic" | "claude">("heuristic");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [claudeResult, setClaudeResult] = useState<AiAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const ESTIMATED_SECONDS = 90;

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => clearInterval(timerRef.current);
    } else {
      clearInterval(timerRef.current);
    }
  }, [loading]);

  const allCards: PoolCard[] = useMemo(
    () => [...deck.zones.pool, ...deck.zones.main, ...deck.zones.side],
    [deck],
  );

  const heuristic = useMemo(() => heuristicAnalyzePool(deck), [deck]);

  const handleClaudeAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    setClaudeResult(null);
    setStreaming("");
    setTab("claude");
    setExpanded(true);

    try {
      const result = await claudeAnalyzePool(allCards, setName, (text) => {
        setStreaming(text);
      });
      setClaudeResult(result);
      setStreaming("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [allCards, setName]);

  const activeResult = tab === "claude" && claudeResult ? claudeResult : heuristic;

  const handleApply = useCallback(() => {
    onApplyBuild(activeResult.mainDeck, activeResult.basics);
  }, [activeResult, onApplyBuild]);

  return (
    <div className="rounded-xl border border-ctp-surface0 bg-ctp-mantle p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm font-semibold text-ctp-text flex items-center gap-2 hover:text-ctp-mauve transition-colors"
        >
          <span className="text-ctp-mauve">✦</span>
          Pool Analysis
          <span className="text-[10px] text-ctp-overlay0">{expanded ? "▲" : "▼"}</span>
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleApply}
            className="text-xs px-3 py-1.5 rounded bg-ctp-mauve/20 text-ctp-mauve hover:bg-ctp-mauve/30 font-medium"
          >
            Apply Build
          </button>
        </div>
      </div>

      {/* Compact summary — always visible */}
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${COLOR_DOTS[heuristic.colors.primary]}`} />
        <span className={`w-3 h-3 rounded-full ${COLOR_DOTS[heuristic.colors.secondary]}`} />
        {heuristic.colors.splash && (
          <>
            <span className="text-[10px] text-ctp-overlay0">+</span>
            <span className={`w-2.5 h-2.5 rounded-full ${COLOR_DOTS[heuristic.colors.splash]}`} />
          </>
        )}
        <span className="text-xs text-ctp-subtext1">
          {COLOR_NAMES[heuristic.colors.primary]}-{COLOR_NAMES[heuristic.colors.secondary]}
          {heuristic.colors.splash ? ` (splash ${COLOR_NAMES[heuristic.colors.splash]})` : ""}
        </span>
        <span className="text-[10px] text-ctp-overlay0 ml-auto">
          {heuristic.mainDeck.length} spells + {Object.values(heuristic.basics).reduce((a, b) => a + b, 0)} lands
        </span>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="mt-4">
          {/* Tab switcher */}
          <div className="flex gap-1 mb-4">
            <button
              onClick={() => setTab("heuristic")}
              className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                tab === "heuristic"
                  ? "bg-ctp-surface0 text-ctp-text"
                  : "text-ctp-overlay0 hover:text-ctp-subtext1"
              }`}
            >
              Heuristic
            </button>
            <button
              onClick={() => {
                setTab("claude");
                if (!claudeResult && !loading) handleClaudeAnalyze();
              }}
              className={`text-xs px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1.5 ${
                tab === "claude"
                  ? "bg-ctp-surface0 text-ctp-text"
                  : "text-ctp-overlay0 hover:text-ctp-subtext1"
              }`}
            >
              <span className="text-ctp-mauve">✦</span> Claude
              {loading && <span className="animate-pulse">…</span>}
            </button>
            {tab === "claude" && claudeResult && (
              <button
                onClick={handleClaudeAnalyze}
                disabled={loading}
                className="text-xs px-2 py-1.5 text-ctp-overlay0 hover:text-ctp-subtext1 disabled:opacity-50"
              >
                ↻
              </button>
            )}
          </div>

          {/* Heuristic tab */}
          {tab === "heuristic" && (
            <AnalysisDisplay
              result={heuristic}
              onApply={handleApply}
              label="Apply Heuristic Build"
            />
          )}

          {/* Claude tab */}
          {tab === "claude" && (
            <>
              {loading && (
                <div className="mb-3">
                  {/* Progress bar */}
                  <div className="flex items-center justify-between text-[11px] text-ctp-overlay1 mb-1.5">
                    <span>
                      {streaming ? "Claude is analyzing…" : "Sending pool to Claude…"}
                    </span>
                    <span className="tabular-nums">
                      {elapsed}s / ~{ESTIMATED_SECONDS}s
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ctp-surface0 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-ctp-mauve transition-all duration-1000 ease-linear"
                      style={{
                        width: `${Math.min((elapsed / ESTIMATED_SECONDS) * 100, 95)}%`,
                      }}
                    />
                  </div>

                  {/* Streaming preview */}
                  {streaming && (
                    <div className="mt-2 text-xs text-ctp-overlay1 bg-ctp-base/50 rounded p-3 max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">
                      {streaming.slice(-600)}
                      <span className="animate-pulse">▍</span>
                    </div>
                  )}
                </div>
              )}
              {error && (
                <div className="text-sm text-ctp-red bg-ctp-red/10 rounded p-3 mb-3">
                  {error}
                  <button
                    onClick={handleClaudeAnalyze}
                    className="ml-2 underline hover:no-underline"
                  >
                    Retry
                  </button>
                </div>
              )}
              {claudeResult && !loading && (
                <AnalysisDisplay
                  result={claudeResult}
                  onApply={handleApply}
                  label="Apply Claude Build"
                />
              )}
              {!claudeResult && !loading && !error && (
                <div className="text-center py-6">
                  <button
                    onClick={handleClaudeAnalyze}
                    className="text-sm px-4 py-2 rounded-lg bg-ctp-mauve text-ctp-crust font-semibold hover:bg-ctp-lavender transition-colors"
                  >
                    ✦ Analyze with Claude
                  </button>
                  <p className="text-[10px] text-ctp-overlay0 mt-2">
                    Uses Claude Code on the server for deeper analysis
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
