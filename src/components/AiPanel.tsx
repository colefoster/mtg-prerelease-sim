import { useCallback, useMemo, useState } from "react";
import type { AiAnalysis } from "../lib/ai";
import { analyzePool } from "../lib/ai";
import type { DeckState } from "../types";

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

interface Props {
  deck: DeckState;
  onApplyBuild: (mainNames: string[], basics: DeckState["basics"]) => void;
}

export function AiPanel({ deck, onApplyBuild }: Props) {
  const [expanded, setExpanded] = useState(false);

  const result: AiAnalysis = useMemo(() => analyzePool(deck), [deck]);

  const handleApply = useCallback(() => {
    onApplyBuild(result.mainDeck, result.basics);
  }, [result, onApplyBuild]);

  return (
    <div className="rounded-xl border border-ctp-surface0 bg-ctp-mantle p-4">
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm font-semibold text-ctp-text flex items-center gap-2 hover:text-ctp-mauve transition-colors"
        >
          <span className="text-ctp-mauve">✦</span>
          Pool Analysis
          <span className="text-[10px] text-ctp-overlay0">{expanded ? "▲" : "▼"}</span>
        </button>
        <button
          onClick={handleApply}
          className="text-xs px-3 py-1.5 rounded bg-ctp-mauve/20 text-ctp-mauve hover:bg-ctp-mauve/30 font-medium"
        >
          Apply Build
        </button>
      </div>

      {/* Compact summary — always visible */}
      <div className="flex items-center gap-2 mt-2">
        <span className={`w-3 h-3 rounded-full ${COLOR_DOTS[result.colors.primary]}`} />
        <span className={`w-3 h-3 rounded-full ${COLOR_DOTS[result.colors.secondary]}`} />
        {result.colors.splash && (
          <>
            <span className="text-[10px] text-ctp-overlay0">+</span>
            <span className={`w-2.5 h-2.5 rounded-full ${COLOR_DOTS[result.colors.splash]}`} />
          </>
        )}
        <span className="text-xs text-ctp-subtext1">
          {COLOR_NAMES[result.colors.primary]}-{COLOR_NAMES[result.colors.secondary]}
          {result.colors.splash ? ` (splash ${COLOR_NAMES[result.colors.splash]})` : ""}
        </span>
        <span className="text-[10px] text-ctp-overlay0 ml-auto">
          {result.mainDeck.length} spells + {Object.values(result.basics).reduce((a, b) => a + b, 0)} lands
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 space-y-3">
          {/* Pool overview */}
          <div className="text-xs text-ctp-subtext1 leading-relaxed">
            {result.analysis}
          </div>

          {/* Color reasoning */}
          <div className="bg-ctp-base/50 rounded-lg p-3">
            <p className="text-xs text-ctp-overlay1">{result.colors.reasoning}</p>
          </div>

          {/* Commentary */}
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

          {/* Key cards */}
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
        </div>
      )}
    </div>
  );
}
