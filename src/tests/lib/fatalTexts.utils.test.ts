import { beforeEach, describe, expect, it } from "vitest";

import {
  resolveFatalTexts,
  resolveSplashTexts,
} from "@/lib/core/fatal/fatalTexts.utils";
import { patchSettings } from "@/store/settings.store";

describe("fatal texts contract", () => {
  beforeEach(() => {
    patchSettings({ language: "ru" });
  });

  it("always resolves Russian", () => {
    expect(resolveFatalTexts("chunk").kindLabel).toBe("Ошибка загрузки модуля");
    expect(resolveFatalTexts("startup").kindLabel).toBe("Ошибка запуска");
    expect(resolveSplashTexts().loading).toBe("Загрузка...");
    expect(resolveSplashTexts().migrations).toBe("Миграции");
    expect(resolveSplashTexts().database).toBe("База данных");
    expect(resolveSplashTexts().spelling).toBe("Орфография");
    expect(resolveSplashTexts().index).toBe("Индекс аниме");
    expect(resolveSplashTexts().fastLaunch).toBe("Не показывать заставку");
    expect(resolveSplashTexts().yorhaTitle).toBe("ILUHAANIME");
  });

  it("resolves the yorha pod banner", () => {
    expect(resolveFatalTexts("chunk").yorhaBanner).toBe("ERROR // SYSTEM FAILURE");
  });
});
