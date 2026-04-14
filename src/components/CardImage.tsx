import { useState } from "react";
import type { Card } from "../types";

interface Props {
  card: Card;
  className?: string;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseLeave?: () => void;
}

export function CardImage({
  card,
  className = "",
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const src = flipped && card.backImage ? card.backImage : card.image;

  return (
    <div
      className={`relative group aspect-[5/7] rounded-lg overflow-hidden ${className}`}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onContextMenu={(e) => {
        e.preventDefault();
        window.open(card.scryfallUri, "_blank");
      }}
    >
      <img
        src={src}
        alt={card.name}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      {card.backImage && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setFlipped(!flipped);
          }}
          className="absolute top-1 right-1 bg-ctp-surface0/80 hover:bg-ctp-surface1 text-ctp-text rounded-full w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-sm"
          title="Flip card"
        >
          ↻
        </button>
      )}
    </div>
  );
}
