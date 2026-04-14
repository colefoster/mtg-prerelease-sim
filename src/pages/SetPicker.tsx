import { Link } from "react-router-dom";
import { getAllSets } from "../lib/sets";

export function SetPicker() {
  const sets = getAllSets();
  const now = Date.now();

  function isCurrent(releasedAt: string) {
    const release = new Date(releasedAt).getTime();
    const dayMs = 86400000;
    return now >= release - 10 * dayMs && now <= release + 30 * dayMs;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-ctp-text mb-2">
          MTG Prerelease Sim
        </h1>
        <p className="text-ctp-overlay1 mb-8 text-lg italic">
          Rehearse the prerelease: six packs, forty cards, no shot clock.
        </p>

        {sets.length === 0 ? (
          <div className="text-ctp-overlay0 bg-ctp-mantle rounded-xl p-8 text-center">
            <p className="text-lg mb-2">No sets baked yet.</p>
            <p>
              Run{" "}
              <code className="bg-ctp-surface0 px-2 py-1 rounded text-ctp-mauve">
                pnpm fetch-set &lt;code&gt;
              </code>{" "}
              to add a set.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {sets.map((set) => (
              <Link
                key={set.code}
                to={`/open/${set.code}`}
                className="bg-ctp-mantle hover:bg-ctp-surface0 border border-ctp-surface0 hover:border-ctp-surface1 rounded-xl p-6 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={set.iconSvgUri}
                    alt=""
                    className="w-8 h-8"
                    style={{
                      filter:
                        "invert(88%) sepia(9%) saturate(377%) hue-rotate(191deg) brightness(98%) contrast(92%)",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-ctp-text group-hover:text-ctp-mauve transition-colors truncate">
                      {set.name}
                    </h2>
                    <p className="text-sm text-ctp-overlay0 uppercase">
                      {set.code}
                    </p>
                  </div>
                  {isCurrent(set.releasedAt) && (
                    <span className="bg-ctp-mauve/20 text-ctp-mauve text-xs font-medium px-2 py-1 rounded-full">
                      Current
                    </span>
                  )}
                </div>
                <div className="flex justify-between text-sm text-ctp-overlay1">
                  <span>{set.cards.length} cards</span>
                  <span>{set.releasedAt}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
