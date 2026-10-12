import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SpeedGraph } from "@/routes/components/torrent/graph.torrent";
import { patchSettings } from "@/store/settings.store";
import type { DhtStatus } from "@/types/torrent";

const DHT: DhtStatus = { nodes_v4: 10, nodes_v6: 5, pending: 0 };

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("SpeedGraph", () => {
  it("renders only peers and DHT while the torrent list is empty", () => {
    const { container } = render(
      <SpeedGraph download={0} upload={0} peers={0} dht={DHT} active={false} />
    );

    expect(screen.getByText("Peers 0")).toBeTruthy();
    expect(screen.getByText("DHT 15")).toBeTruthy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(screen.queryByText(/^Down/)).toBeNull();
    expect(screen.queryByText(/^Up/)).toBeNull();
  });

  it("renders the canvas and the speed legend once torrents exist", () => {
    const { container } = render(
      <SpeedGraph download={1200} upload={0} peers={3} dht={DHT} active />
    );

    expect(container.querySelector("canvas")).not.toBeNull();
    expect(screen.getByText(/^Down/)).toBeTruthy();
    expect(screen.getByText(/^Up/)).toBeTruthy();
    expect(screen.getByText("Peers 3")).toBeTruthy();
    expect(screen.getByText("DHT 15")).toBeTruthy();
  });
});
