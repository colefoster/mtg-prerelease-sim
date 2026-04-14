import { useDraggable } from "@dnd-kit/core";
import type { PoolCard } from "../types";
import { showPreview, hidePreview } from "./HoverPreview";

interface Props {
  poolCard: PoolCard;
}

export function DraggableCard({ poolCard }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: poolCard.instanceId,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`aspect-[5/7] rounded-lg overflow-hidden relative cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
      onMouseEnter={(e) =>
        showPreview(poolCard.card.image, e.clientX, e.clientY)
      }
      onMouseMove={(e) =>
        showPreview(poolCard.card.image, e.clientX, e.clientY)
      }
      onMouseLeave={() => hidePreview()}
      onContextMenu={(e) => {
        e.preventDefault();
        window.open(poolCard.card.scryfallUri, "_blank");
      }}
    >
      <img
        src={poolCard.card.image}
        alt={poolCard.card.name}
        className="w-full h-full object-cover"
        loading="lazy"
        draggable={false}
      />
      {poolCard.foil && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-ctp-pink/25 via-ctp-sky/10 to-ctp-peach/25 mix-blend-overlay" />
          <span className="absolute top-1 left-1 bg-ctp-peach text-ctp-crust text-[9px] font-bold px-1 py-0.5 rounded">
            FOIL
          </span>
        </>
      )}
    </div>
  );
}
