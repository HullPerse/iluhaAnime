import { Headphones, Images, Music2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { useDailyGameDay } from "@/hooks/daily/day.hook";
import {
  useDailyGame,
  usePrepareDailyAudio,
  usePrepareDailyGame,
  usePrepareDailyOp,
  useWarmDailyAudio,
  useWarmDailyOp,
} from "@/hooks/daily/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import { formatDailyDate } from "@/lib/daily/format.utils";
import type { DailyClipProgress, DailyFramesView, DailyMode, DailyOpView } from "@/types/api/daily";
import type { TranslationKey } from "@/types/core/i18n";

import AudioModeArt from "@/routes/components/collection/audioModeArt.cards";
import CharactersMode from "@/routes/components/collection/charactersMode.cards";
import GameCharacters from "@/routes/components/collection/gameCharacters.cards";
import FramesModeArt from "@/routes/components/collection/framesModeArt.cards";
import GameAudio from "@/routes/components/collection/gameAudio.cards";
import GameFrames from "@/routes/components/collection/gameFrames.cards";
import GameOp from "@/routes/components/collection/gameOp.cards";
import ModeCard from "@/routes/components/collection/modeCard.cards";
import OpModeArt from "@/routes/components/collection/opModeArt.cards";

const MODE_META: readonly {
  mode: DailyMode;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  Icon: typeof Images;
  Art: typeof FramesModeArt;
}[] = [
  {
    mode: "frames",
    titleKey: "collection.game.mode.frames",
    descriptionKey: "collection.game.mode.frames.description",
    Icon: Images,
    Art: FramesModeArt,
  },
  {
    mode: "op",
    titleKey: "collection.game.mode.op",
    descriptionKey: "collection.game.mode.op.description",
    Icon: Music2,
    Art: OpModeArt,
  },
  {
    mode: "audio",
    titleKey: "collection.game.mode.audio",
    descriptionKey: "collection.game.mode.audio.description",
    Icon: Headphones,
    Art: AudioModeArt,
  },
];

export default function GameCards() {
  const { t } = useI18n();
  const day = useDailyGameDay();
  const game = useDailyGame(day);
  const prepare = usePrepareDailyGame(day);
  const prepareOp = usePrepareDailyOp(day);
  const prepareAudio = usePrepareDailyAudio(day);
  const { mutate: warmOp, isPending: warmingOp } = useWarmDailyOp(day);
  const { mutate: warmAudio, isPending: warmingAudio } = useWarmDailyAudio(day);
  const warmedOp = useRef<boolean>(false);
  const warmedAudio = useRef<boolean>(false);
  const [clipProgress, setClipProgress] = useState<Partial<Record<DailyMode, DailyClipProgress>>>(
    {}
  );
  const [frames, setFrames] = useState<DailyFramesView | null>(null);
  const [op, setOp] = useState<DailyOpView | null>(null);
  const [audio, setAudio] = useState<DailyOpView | null>(null);
  const [charactersDay, setCharactersDay] = useState<string | null>(null);
  const dayRef = useRef<string>(day);

  useEffect(() => {
    if (dayRef.current === day) return;
    dayRef.current = day;
    warmedOp.current = false;
    warmedAudio.current = false;
    setClipProgress({});
    setFrames(null);
    setOp(null);
    setAudio(null);
  }, [day]);

  useTauriEvent<DailyClipProgress>("daily-clip-progress", (event) => {
    const payload = event.payload;

    if (payload.day !== day || payload.total <= 0) return;
    setClipProgress((previous) => ({ ...previous, [payload.mode]: payload }));
  });

  useEffect(() => {
    const data = game.data;

    if (warmedOp.current || data === undefined || data.day !== day) return;
    const view = data.modes.find((mode) => mode.mode === "op");

    if (!view || view.result !== null) return;
    warmedOp.current = true;
    warmOp();
  }, [day, game.data, warmOp]);

  useEffect(() => {
    const data = game.data;

    if (warmedAudio.current || data === undefined || data.day !== day) return;
    const view = data.modes.find((mode) => mode.mode === "audio");

    if (!view || view.result !== null) return;
    warmedAudio.current = true;
    warmAudio();
  }, [day, game.data, warmAudio]);

  if (game.isPending) {
    return (
      <div className="daily-game">
        <section className="daily-state-window">
          <TabLoader />
        </section>
      </div>
    );
  }

  if (game.isError) {
    return (
      <div className="daily-game">
        <section className="daily-state-window">
          <p className="daily-form-error" role="alert">
            {t("collection.game.error")}
          </p>
          <Button onClick={() => ignore(game.refetch())}>{t("collection.retry")}</Button>
        </section>
      </div>
    );
  }

  const data = game.data;

  if (!data) {
    return (
      <div className="daily-game">
        <section className="daily-state-window">
          <TabLoader />
        </section>
      </div>
    );
  }

  if (frames !== null && frames.day === day) {
    return (
      <div className="daily-game">
        <GameFrames day={day} initial={frames} onClose={() => setFrames(null)} />
      </div>
    );
  }

  if (charactersDay === day)
    return (
      <div className="daily-game">
        <GameCharacters key={day} day={day} onClose={() => setCharactersDay(null)} />
      </div>
    );

  if (op !== null && op.day === day) {
    return (
      <div className="daily-game">
        <GameOp day={day} initial={op} onClose={() => setOp(null)} />
      </div>
    );
  }

  if (audio !== null && audio.day === day) {
    return (
      <div className="daily-game">
        <GameAudio day={day} initial={audio} onClose={() => setAudio(null)} />
      </div>
    );
  }

  const clearClipProgress = (mode: DailyMode) => {
    setClipProgress((previous) => ({ ...previous, [mode]: undefined }));
  };

  const starts: Record<
    DailyMode,
    {
      onStart: () => void;
      onWarm?: () => void;
      starting: boolean;
      progress: DailyClipProgress | null;
    }
  > = {
    frames: {
      onStart: () =>
        prepare.mutate("frames", {
          onSuccess: (view) => {
            if (view.day === dayRef.current) setFrames(view);
          },
        }),
      starting: prepare.isPending,
      progress: null,
    },
    op: {
      onStart: () => {
        clearClipProgress("op");
        prepareOp.mutate(undefined, {
          onSuccess: (view) => {
            if (view.day === dayRef.current) setOp(view);
          },
        });
      },
      starting: prepareOp.isPending,
      progress: prepareOp.isPending || warmingOp ? (clipProgress.op ?? null) : null,
    },
    audio: {
      onStart: () => {
        clearClipProgress("audio");
        prepareAudio.mutate(undefined, {
          onSuccess: (view) => {
            if (view.day === dayRef.current) setAudio(view);
          },
        });
      },
      onWarm: () => {
        if (warmedAudio.current) return;
        const view = data.modes.find((mode) => mode.mode === "audio");

        if (!view || view.result !== null) return;
        warmedAudio.current = true;
        warmAudio();
      },
      starting: prepareAudio.isPending,
      progress: prepareAudio.isPending || warmingAudio ? (clipProgress.audio ?? null) : null,
    },
  };
  const prepareError = prepare.error ?? prepareOp.error ?? prepareAudio.error;

  return (
    <div className="daily-game">
      <header className="daily-game-head">
        <div className="daily-game-meta">
          <span>{t("collection.game.date", { date: formatDailyDate(day) })}</span>
          <span>{t("collection.game.streak", { count: data.streak })}</span>
        </div>
      </header>
      <div className="daily-modes">
        {MODE_META.map((meta) => (
          <ModeCard
            key={meta.mode}
            meta={meta}
            view={data.modes.find((mode) => mode.mode === meta.mode)}
            onStart={() => starts[meta.mode].onStart()}
            onWarm={() => starts[meta.mode].onWarm?.()}
            starting={starts[meta.mode].starting}
            progress={starts[meta.mode].progress}
          />
        ))}
        <CharactersMode key={day} day={day} onStart={() => setCharactersDay(day)} />
      </div>
      {prepareError !== null && (
        <p className="daily-form-error" role="alert">
          {prepareError.message}
        </p>
      )}
    </div>
  );
}
