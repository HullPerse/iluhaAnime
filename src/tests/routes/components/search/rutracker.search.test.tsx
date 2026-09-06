import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import RutrackerLoginModal from "@/routes/components/search/rutracker.search";
import { useSettingsStore } from "@/store/settings.store";

const COOKIES_PLACEHOLDER = "bb_session=...; bb_data=...; uid=...";

function renderModal() {
  return render(<RutrackerLoginModal setRutrackerAuth={() => {}} setShowLogin={() => {}} />);
}

describe("RutrackerLoginModal default tab", () => {
  beforeEach(() => {
    useSettingsStore.setState({ searchProxyUrls: {} });
  });

  afterEach(() => {
    cleanup();
    useSettingsStore.setState({ searchProxyUrls: {} });
  });

  it("opens the login form when no proxy is configured", () => {
    const { queryByPlaceholderText } = renderModal();
    expect(queryByPlaceholderText(COOKIES_PLACEHOLDER)).toBeNull();
  });

  it("opens the cookies form when a rutracker proxy is configured", () => {
    useSettingsStore.setState({
      searchProxyUrls: { rutracker: "socks5://127.0.0.1:10808" },
    });
    const { getByPlaceholderText } = renderModal();
    expect(getByPlaceholderText(COOKIES_PLACEHOLDER)).not.toBeNull();
  });
});
