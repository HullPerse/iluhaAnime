import { LAB_STUDIO, LAB_STUDIO_PARTIAL } from "@/config/cards/labFixtures.config";

import CardFace from "@/routes/components/collection/cardFace.cards";

export default function LabStudioSection() {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <figure className="m-0 flex w-40 flex-col gap-1">
        <CardFace card={LAB_STUDIO} />
        <figcaption className="windows95-text text-hint">Коллаж 2x2, четыре обложки</figcaption>
      </figure>
      <figure className="m-0 flex w-40 flex-col gap-1">
        <CardFace card={LAB_STUDIO_PARTIAL} />
        <figcaption className="windows95-text text-hint">Пустая ячейка: монограмма</figcaption>
      </figure>
      <div className="windows95-border bg-field flex min-w-60 flex-1 flex-col gap-1 p-2">
        <p className="windows95-text m-0 font-bold">Как читать коллаж</p>
        <p className="windows95-text text-hint m-0">
          Студия получает четыре обложки из своих тайтлов. Если обложек меньше, ячейка заполняется
          инициалами студии, а не заглушкой.
        </p>
        <p className="windows95-text text-hint m-0">
          Holo включается только с Rare: у Junk и Common остаётся обычная рамка.
        </p>
      </div>
    </div>
  );
}
