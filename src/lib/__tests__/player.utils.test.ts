import { describe, it, expect } from "vitest";
import { parseTime, formatStreams, isAssSub } from "../player.utils";
import type { VideoStreamInfo } from "@/types";

describe("parseTime", () => {
  it("parses HH:MM:SS", () => {
    expect(parseTime("01:30:00")).toBe(5400);
    expect(parseTime("00:05:30")).toBe(330);
  });

  it("parses MM:SS", () => {
    expect(parseTime("05:30")).toBe(330);
    expect(parseTime("00:45")).toBe(45);
  });

  it("parses plain seconds", () => {
    expect(parseTime("120")).toBe(120);
  });

  it("parses with decimal seconds", () => {
    expect(parseTime("01:30.5")).toBe(90.5);
  });

  it("returns null for invalid input", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
});

describe("formatStreams", () => {
  it("formats with language and codec", () => {
    const stream: VideoStreamInfo = {
      index: 1, codec_type: "audio", codec_name: "aac",
      language: "jpn", title: "Japanese", is_default: false,
    };
    const result = formatStreams(stream);
    expect(result).toContain("JPN");
    expect(result).toContain("aac");
    expect(result).toContain("Japanese");
  });

  it("falls back to codec name when no language or title", () => {
    const stream: VideoStreamInfo = {
      index: 2, codec_type: "subtitle", codec_name: "ass",
      language: null, title: null, is_default: false,
    };
    expect(formatStreams(stream)).toBe("ass");
  });
});

describe("isAssSub", () => {
  it("detects ass codec", () => {
    const s: VideoStreamInfo = { index: 0, codec_type: "subtitle", codec_name: "ass", language: null, title: null, is_default: false };
    expect(isAssSub(s)).toBe(true);
  });

  it("detects ssa codec", () => {
    const s: VideoStreamInfo = { index: 0, codec_type: "subtitle", codec_name: "ssa", language: null, title: null, is_default: false };
    expect(isAssSub(s)).toBe(true);
  });

  it("detects ass file path", () => {
    const s: VideoStreamInfo = { index: 0, codec_type: "subtitle", codec_name: "unknown", language: null, title: null, is_default: false, file_path: "subs/file.ass" };
    expect(isAssSub(s)).toBeTruthy();
  });

  it("returns falsy for non-ASS", () => {
    const s: VideoStreamInfo = { index: 0, codec_type: "subtitle", codec_name: "webvtt", language: null, title: null, is_default: false };
    expect(isAssSub(s)).toBeFalsy();
  });
});
