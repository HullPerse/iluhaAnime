import { LAB_BINDER } from "@/config/cards/labFixtures.config";

import CardFace from "@/routes/components/collection/cardFace.cards";

export default function LabBinderPage() {
  return (
    <div
      data-testid="lab-binder"
      className="grid w-fit grid-cols-4 gap-1 bg-[color-mix(in_srgb,var(--color-win-shadow)_55%,transparent)] p-1"
    >
      {Array.from({ length: 12 }, (_, index) => {
        const card = LAB_BINDER[index];
        return (
          <div
            key={index}
            data-testid="lab-binder-pocket"
            data-pocket-index={index}
            className="windows95-border bg-field flex w-20 flex-col items-center justify-center p-1"
          >
            {card === undefined ? (
              <span className="py-10" aria-hidden="true" />
            ) : (
              <CardFace card={card} />
            )}
            <span className="windows95-text text-hint mt-1">{index + 1}</span>
          </div>
        );
      })}
    </div>
  );
}
