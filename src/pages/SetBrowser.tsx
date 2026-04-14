import { Link, useParams } from "react-router-dom";
import { getSet } from "../lib/sets";
import { CardImage } from "../components/CardImage";

export function SetBrowser() {
  const { setCode } = useParams<{ setCode: string }>();
  const set = setCode ? getSet(setCode) : undefined;

  if (!set) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-center text-ctp-overlay0">
          <p className="text-lg mb-2">
            Set <span className="text-ctp-red">{setCode}</span> not found.
          </p>
          <p>
            Run{" "}
            <code className="bg-ctp-surface0 px-2 py-1 rounded text-ctp-mauve">
              pnpm fetch-set {setCode}
            </code>
          </p>
          <Link to="/" className="text-ctp-mauve hover:text-ctp-lavender mt-4 inline-block">
            ← Back to sets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/" className="text-ctp-overlay1 hover:text-ctp-text">
            ← Sets
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-ctp-text">{set.name}</h1>
            <p className="text-sm text-ctp-overlay0">
              {set.code.toUpperCase()} · {set.cards.length} cards ·{" "}
              {set.prereleasePromos.length} prerelease promos
            </p>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
          {set.cards.map((card) => (
            <CardImage key={card.id} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
}
