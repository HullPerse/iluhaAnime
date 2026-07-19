import { describe, it, expect } from "vitest";
import { fmtSize, fmtSpeed, fmtETA, stateLabel } from "../torrent.utils";

describe("fmtSize", () => {
  it("formats bytes", () => {
    expect(fmtSize(0)).toBe("0 B");
    expect(fmtSize(512)).toBe("512 B");
  });

  it("formats KB", () => {
    expect(fmtSize(1024)).toBe("1.0 KB");
    expect(fmtSize(1536)).toBe("1.5 KB");
  });

  it("formats MB", () => {
    expect(fmtSize(1048576)).toBe("1.0 MB");
    expect(fmtSize(1572864)).toBe("1.5 MB");
  });

  it("formats GB", () => {
    expect(fmtSize(1073741824)).toBe("1.00 GB");
    expect(fmtSize(1610612736)).toBe("1.50 GB");
  });
});

describe("fmtSpeed", () => {
  it("returns empty for zero or negative", () => {
    expect(fmtSpeed(0)).toBe("");
    expect(fmtSpeed(-1)).toBe("");
  });

  it("formats B/s", () => {
    expect(fmtSpeed(500)).toBe("500 B/s");
  });

  it("formats KB/s", () => {
    expect(fmtSpeed(2048)).toBe("2.0 KB/s");
  });

  it("formats MB/s", () => {
    expect(fmtSpeed(2097152)).toBe("2.0 MB/s");
  });
});

describe("fmtETA", () => {
  it("returns empty for null or invalid", () => {
    expect(fmtETA(null)).toBe("");
    expect(fmtETA(0)).toBe("");
    expect(fmtETA(Infinity)).toBe("");
  });

  it("formats seconds", () => {
    expect(fmtETA(45)).toBe("45 сек");
  });

  it("formats minutes and seconds", () => {
    expect(fmtETA(125)).toBe("2 мин 5 сек");
  });

  it("formats hours and minutes", () => {
    expect(fmtETA(3661)).toBe("1 ч 1 мин");
  });
});

describe("stateLabel", () => {
  it("returns Russian labels for known states", () => {
    expect(stateLabel("live")).toBe("Загружается");
    expect(stateLabel("paused")).toBe("Пауза");
    expect(stateLabel("initializing")).toBe("Инициализация");
    expect(stateLabel("error")).toBe("Ошибка");
  });

  it("returns raw state for unknown states", () => {
    expect(stateLabel("checking")).toBe("checking");
    expect(stateLabel("")).toBe("");
  });
});
