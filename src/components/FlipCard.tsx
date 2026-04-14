import type { PackCard } from "../types";
import { showPreview, hidePreview } from "./HoverPreview";

const CARD_BACK = "https://backs.scryfall.io/normal/0/b/0bbe23ef-b16a-4e9e-8191-468527da498e.jpg";

interface Props {
  packCard: PackCard;
  revealed: boolean;
  large: boolean;
}

export function FlipCard({ packCard, revealed, large }: Props) {
  const { card, foil } = packCard;

  return (
    <div
      className={`aspect-[5/7] rounded-lg ${large ? "" : "cursor-pointer"}`}
      style={{ perspective: "1200px" }}
      onMouseEnter={(e) => {
        if (!large && revealed) showPreview(card.image, e.clientX, e.clientY);
      }}
      onMouseMove={(e) => {
        if (!large && revealed) showPreview(card.image, e.clientX, e.clientY);
      }}
      onMouseLeave={() => hidePreview()}
      onContextMenu={(e) => {
        if (revealed) {
          e.preventDefault();
          window.open(card.scryfallUri, "_blank");
        }
      }}
    >
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Back (card back) */}
        <div
          className="absolute inset-0 rounded-lg overflow-hidden"
          style={{ backfaceVisibility: "hidden" }}
        >
          <img
            src={CARD_BACK}
            alt="Card back"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Front (card face) */}
        <div
          className="absolute inset-0 rounded-lg overflow-hidden"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <img
            src={card.image}
            alt={card.name}
            className="w-full h-full object-cover"
          />
          {foil && (
            <>
              <div className="absolute inset-0 bg-gradient-to-br from-ctp-pink/25 via-ctp-sky/10 to-ctp-peach/25 mix-blend-overlay" />
              <span className="absolute top-1.5 left-1.5 bg-ctp-peach text-ctp-crust text-[10px] font-bold px-1.5 py-0.5 rounded">
                FOIL
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
