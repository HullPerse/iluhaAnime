import { useState } from "react";

import { useCell } from "@hullperse/hp_utils/react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import {
  CARD_RARITIES,
  cardKindLabelKeys,
  cardRarityLabelKeys,
  cardVariantLabelKeys,
  packLabelKey,
} from "@/config/cards/labels.config";
import {
  LAB_BINDER,
  LAB_CARDS,
  LAB_GIFT,
  LAB_PACK,
  LAB_SHELF,
  LAB_SHOP_PACKS,
  LAB_STUDIO,
  LAB_STUDIO_PARTIAL,
  LAB_WALLET,
  labCombinationCount,
} from "@/config/cards/labFixtures.config";
import { useI18n } from "@/hooks/i18n.hook";
import { settingsAtoms } from "@/store/settings.store";

import CardBack from "@/routes/components/collection/cardBack.cards";
import CardFace from "@/routes/components/collection/cardFace.cards";
import LabMatrix from "@/routes/components/collection/labMatrix.cards";
import LabPack from "@/routes/components/collection/labPack.cards";
import LabSection from "@/routes/components/collection/labSection.cards";
import ShopPack from "@/routes/components/collection/shopPack.cards";

const SCALES = [
  { label: "100%", width: "9rem" },
  { label: "150%", width: "13.5rem" },
  { label: "200%", width: "18rem" },
] as const;

function BinderPage() {
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
              <span className="windows95-text text-hint py-10">Пусто</span>
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

function AnimeShelf() {
  const { t } = useI18n();

  return (
    <div
      data-testid="lab-shelf"
      className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-2"
    >
      {LAB_SHELF.map((item) => {
        const owned = item.characters.filter((character) => character.owned).length;
        return (
          <article
            key={item.id}
            data-testid="lab-shelf-item"
            className="windows95-border bg-field flex min-w-0 gap-2 p-2"
          >
            <img
              src={item.cover}
              alt=""
              className="border-win-shadow h-28 w-20 shrink-0 border object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h3 className="windows95-text m-0 truncate font-bold" title={item.title}>
                {item.title}
              </h3>
              <p className="windows95-text text-hint m-0">
                {t("collection.cards")}: {owned}/{item.characters.length}
              </p>
              <div className="grid grid-cols-4 gap-1">
                {item.characters.map((character) => (
                  <div key={character.id} className="min-w-0">
                    <img
                      src={character.imageUrl}
                      alt=""
                      className={
                        character.owned
                          ? "border-win-shadow h-12 w-full border object-cover"
                          : "border-win-shadow h-12 w-full border object-cover opacity-25 grayscale"
                      }
                    />
                    <span
                      className={
                        character.owned
                          ? "windows95-text mt-0.5 block truncate"
                          : "windows95-text text-hint mt-0.5 block truncate"
                      }
                      title={character.owned ? character.name : undefined}
                    >
                      {character.owned ? character.name : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function StudioSection() {
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

export default function CardsLab() {
  const { t } = useI18n();
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const [wallet, setWallet] = useState<number>(LAB_WALLET);
  const [notice, setNotice] = useState<string>("");
  const [dustOpen, setDustOpen] = useState<boolean>(false);
  const [giftOpen, setGiftOpen] = useState<boolean>(false);


  return (
    <main className="bg-background text-text min-h-screen w-full p-2">
      <header className="windows95-active-border bg-secondary flex flex-wrap items-center gap-2 px-2 py-1">
        <h1 className="windows95-text text-title-text m-0 text-base font-bold">
          Лаборатория карточек
        </h1>
        <span className="windows95-text">
          {labCombinationCount()} комбинаций, 5 типов × 5 редкостей × 3 варианта
        </span>
        <span
          className={
            enableAnimations
              ? "windows95-text text-success ml-auto"
              : "windows95-text text-hint ml-auto"
          }
        >
          Анимации: {enableAnimations ? "включены" : "выключены"}
        </span>
      </header>
      <p className="windows95-text text-hint mt-1 mb-2">
        Dev-only маршрут. Команды карточной коллекции не вызываются; данные берутся из фикстур.
      </p>

      <div className="flex flex-col gap-2">
        <LabSection id="lab-matrix" title="Матрица карточек" hint="Все типы, редкости и варианты">
          <LabMatrix cards={LAB_CARDS} />
        </LabSection>

        <LabSection
          id="lab-scale"
          title="Масштаб и рубашки"
          hint="100 / 150 / 200% и пять свечений"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start gap-3">
              {SCALES.map((scale) => (
                <figure key={scale.label} className="m-0 flex flex-col gap-1">
                  <div style={{ width: scale.width }}>
                    <CardFace card={LAB_GIFT} />
                  </div>
                  <figcaption className="windows95-text text-hint">{scale.label}</figcaption>
                </figure>
              ))}
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {CARD_RARITIES.map((rarity) => (
                <figure key={rarity} className="m-0 flex w-20 flex-col gap-1">
                  <CardBack rarity={rarity} />
                  <figcaption className="windows95-text text-hint">
                    {t(cardRarityLabelKeys[rarity])}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </LabSection>

        <LabSection id="lab-pack" title="Пак и раскрытие" hint="5 секунд, клик, Skip, Replay">
          <LabPack cards={LAB_PACK} />
        </LabSection>

        <LabSection id="lab-binder" title="Биндер" hint="Страница 4×3">
          <BinderPage />
        </LabSection>

        <LabSection id="lab-shelf" title="Полка аниме" hint="Обложка, ростер и силуэты">
          <AnimeShelf />
        </LabSection>

        <LabSection id="lab-studio" title="Коллаж студии" hint="2×2 и монограмма">
          <StudioSection />
        </LabSection>

        <LabSection id="lab-shop" title="Магазин" hint="Демо-кошелёк без покупок">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="windows95-text font-bold">
                Кошелёк: <span className="tabular-nums">{wallet}</span>
              </span>
            </div>
            {notice !== "" && (
              <p className="windows95-text text-success m-0" role="status">
                {notice}
              </p>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] items-start gap-2">
              {LAB_SHOP_PACKS.map((pack) => (
                <ShopPack
                  key={pack.packKind}
                  pack={pack}
                  wallet={wallet}
                  buying={false}
                  onBuy={() => {
                    setWallet((value) => Math.max(0, value - pack.price));
                    setNotice(`${t(packLabelKey(pack.packKind))}: покупка демонстрационная.`);
                  }}
                />
              ))}
            </div>
          </div>
        </LabSection>

        <LabSection id="lab-dialogs" title="Диалоги" hint="Разбор и подарок">
          <div className="flex flex-wrap items-start gap-2">
            <div className="windows95-border bg-field flex min-w-60 flex-1 flex-col gap-2 p-2">
              <h3 className="windows95-text m-0 font-bold">Разбор карточки</h3>
              <p className="windows95-text text-hint m-0">
                Диалог показывает ценность и подтверждение. В лаборатории карточка не удаляется.
              </p>
              <Button className="h-6 self-start px-2 text-xs" onClick={() => setDustOpen(true)}>
                Открыть разбор
              </Button>
            </div>
            <div className="windows95-border bg-field flex min-w-60 flex-1 flex-col gap-2 p-2">
              <h3 className="windows95-text m-0 font-bold">Подарок</h3>
              <p className="windows95-text text-hint m-0">
                Состояние подаренной карточки: источник, редкость и ценность.
              </p>
              <Button className="h-6 self-start px-2 text-xs" onClick={() => setGiftOpen(true)}>
                Открыть подарок
              </Button>
            </div>
          </div>
        </LabSection>
      </div>

      {dustOpen && (
        <Modal header="Разбор карточки" onClose={() => setDustOpen(false)} className="w-96">
          <div className="flex w-full gap-3">
            <div className="w-28 shrink-0">
              <CardFace card={LAB_GIFT} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="windows95-text m-0 font-bold">{LAB_GIFT.title}</p>
              <p className="windows95-text text-hint m-0">
                Разбор вернёт {LAB_GIFT.value} чубриков. Это демонстрация, карточка останется в
                коллекции.
              </p>
              <div className="flex justify-end gap-1">
                <Button className="h-6 px-2 text-xs" onClick={() => setDustOpen(false)}>
                  Отмена
                </Button>
                <Button
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setDustOpen(false);
                    setNotice(`Разбор: +${LAB_GIFT.value} (демо).`);
                  }}
                >
                  Разобрать
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {giftOpen && (
        <Modal header="Подарок" onClose={() => setGiftOpen(false)} className="w-96">
          <div className="flex w-full gap-3">
            <div className="w-28 shrink-0">
              <CardFace card={LAB_GIFT} tilt="full" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="windows95-text m-0 font-bold">{LAB_GIFT.title}</p>
              <p className="windows95-text text-hint m-0">
                {t(cardKindLabelKeys[LAB_GIFT.kind])}, {t(cardRarityLabelKeys[LAB_GIFT.rarity])},{" "}
                {t(cardVariantLabelKeys[LAB_GIFT.variant])}
              </p>
              <p className="windows95-text m-0">
                Источник: <strong>Подарок</strong>
              </p>
              <p className="windows95-text m-0">
                Ценность: <strong>{LAB_GIFT.value}</strong>
              </p>
              <div className="flex justify-end">
                <Button className="h-6 px-2 text-xs" onClick={() => setGiftOpen(false)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
