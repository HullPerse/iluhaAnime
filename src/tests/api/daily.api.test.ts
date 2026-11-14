import { describe, expect, it } from "vitest";

import { DailyApi } from "@/api/daily.api";
import type { ApiTransport } from "@/types/core/transport";

const day = "2026-11-14";
const proxy = "http://127.0.0.1:7890";

const answer = {
  mediaId: 16498,
  title: "Shingeki no Kyojin",
  year: 2013,
  format: "TV",
  episodes: 25,
  genres: ["Action"],
  studio: "Wit Studio",
  score: 85,
  source: "Manga",
};

const result = {
  won: true,
  attempts: 2,
  answer,
  rewardPackId: "daily-2026-11-14-frames",
};

const bootstrap = {
  day,
  modes: [
    {
      mode: "frames",
      state: "ready",
      attempts: 0,
      maxAttempts: 6,
      error: null,
      result: null,
    },
  ],
  streak: 3,
};

const framesView = {
  day,
  mode: "frames",
  attempts: 1,
  maxAttempts: 6,
  revealed: 2,
  frames: [{ slot: 0, dataUrl: "data:image/png;base64,AA", hintKind: "year", hintValue: "2013" }],
  result: null,
};

function opView(mode: "op" | "audio") {
  return {
    day,
    mode,
    attempts: 0,
    maxAttempts: 5,
    revealed: 0,
    clipPath: "/clips/clip.mp4",
    fullPath: "/clips/full.mp4",
    startFraction: 0.12,
    themeType: "OP",
    themeTitle: "Guren no Yumiya",
    hints: [{ slot: 0, hintKind: "year", hintValue: "2013" }],
    result: null,
  };
}

const guessView = {
  correct: true,
  sameFranchise: false,
  attempts: 2,
  maxAttempts: 6,
  revealed: 1,
  finished: true,
  frame: null,
  result,
};

const opGuessView = {
  correct: true,
  sameFranchise: false,
  finished: true,
  state: opView("op"),
};

const history = [
  {
    day: "2026-11-13",
    mode: "frames",
    won: true,
    attempts: 2,
    maxAttempts: 6,
    mediaId: 16498,
    title: "Shingeki no Kyojin",
    playedAt: 1_760_000_000,
  },
];

function fakeTransport(responses: Record<string, unknown>) {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const transport: ApiTransport = {
    call: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      calls.push({ command, args });
      return responses[command] as T;
    },
  };
  return { calls, transport };
}

describe("DailyApi", () => {
  it("maps bootstrap, frames, guesses, history and reset", async () => {
    const { calls, transport } = fakeTransport({
      daily_game_bootstrap: bootstrap,
      daily_game_prepare: framesView,
      daily_game_reveal_frames: framesView,
      daily_game_guess: guessView,
      daily_game_skip: guessView,
      daily_game_history: history,
      daily_game_reset: null,
    });
    const api = new DailyApi(transport);

    const daily = await api.bootstrap(day);
    const prepared = await api.prepare(day, "frames", proxy);
    const revealed = await api.revealFrames(day, proxy);
    const guessed = await api.guess(day, "frames", 16498, ["Shingeki no Kyojin"], proxy);
    const skipped = await api.skip(day, "frames", proxy);
    const historyItems = await api.history(day, "frames");
    await api.reset();

    expect(daily.streak).toBe(3);
    expect(prepared.revealed).toBe(2);
    expect(revealed.frames).toHaveLength(1);
    expect(guessed.correct).toBe(true);
    expect(skipped.finished).toBe(true);
    expect(historyItems[0]?.title).toBe("Shingeki no Kyojin");

    expect(calls).toEqual([
      { command: "daily_game_bootstrap", args: { day } },
      { command: "daily_game_prepare", args: { day, mode: "frames", proxyUrl: proxy } },
      { command: "daily_game_reveal_frames", args: { day, proxyUrl: proxy } },
      {
        command: "daily_game_guess",
        args: {
          day,
          mode: "frames",
          mediaId: 16498,
          guessedTitles: ["Shingeki no Kyojin"],
          proxyUrl: proxy,
        },
      },
      { command: "daily_game_skip", args: { day, mode: "frames", proxyUrl: proxy } },
      { command: "daily_game_history", args: { day, mode: "frames", limit: 20 } },
      { command: "daily_game_reset", args: undefined },
    ]);
  });

  it("maps the OP and audio commands without the AniList proxy", async () => {
    const op = opView("op");
    const audio = opView("audio");
    const { calls, transport } = fakeTransport({
      daily_game_prepare_op: op,
      daily_game_prepare_audio: audio,
      daily_game_guess_op: opGuessView,
      daily_game_skip_op: opGuessView,
      daily_game_guess_audio: { ...opGuessView, state: audio },
      daily_game_skip_audio: { ...opGuessView, state: audio },
    });
    const api = new DailyApi(transport);

    await api.prepareOp(day, proxy);
    await api.prepareAudio(day, proxy);
    await api.guessOp(day, 16498, ["Shingeki no Kyojin"]);
    await api.skipOp(day);
    await api.guessAudio(day, 16498, ["Shingeki no Kyojin"]);
    await api.skipAudio(day);

    expect(calls).toEqual([
      { command: "daily_game_prepare_op", args: { day, proxyUrl: proxy } },
      { command: "daily_game_prepare_audio", args: { day, proxyUrl: proxy } },
      {
        command: "daily_game_guess_op",
        args: { day, mediaId: 16498, guessedTitles: ["Shingeki no Kyojin"] },
      },
      { command: "daily_game_skip_op", args: { day } },
      {
        command: "daily_game_guess_audio",
        args: { day, mediaId: 16498, guessedTitles: ["Shingeki no Kyojin"] },
      },
      { command: "daily_game_skip_audio", args: { day } },
    ]);
  });

  it("rejects a malformed bootstrap payload", async () => {
    const { transport } = fakeTransport({
      daily_game_bootstrap: { day, modes: [], streak: "3" },
    });
    const api = new DailyApi(transport);

    await expect(api.bootstrap(day)).rejects.toThrow();
  });
});
