import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

interface Props {
  id: "pool" | "main" | "side";
  label: string;
  children: ReactNode;
}

export function DropZone({ id, label, children }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-4 min-h-[100px] transition-colors ${
        isOver
          ? "border-ctp-mauve bg-ctp-mauve/5"
          : "border-ctp-surface0 bg-ctp-mantle"
      }`}
    >
      {label && (
        <h3 className="text-sm font-semibold text-ctp-text mb-3">{label}</h3>
      )}
      {children}
    </div>
  );
}
