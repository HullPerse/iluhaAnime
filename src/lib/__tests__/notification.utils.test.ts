import { describe, it, expect, vi, beforeEach } from "vitest";
import { showError } from "../notification.utils";
import { useNotificationStore } from "@/store/notification.store";

const addSpy = vi.spyOn(useNotificationStore.getState(), "add");

beforeEach(() => {
  useNotificationStore.setState({ items: [], unreadCount: 0 });
  addSpy.mockClear();
});

describe("showError", () => {
  it("calls store add with type error", () => {
    showError("Test Error", "Something broke");
    expect(addSpy).toHaveBeenCalledWith("Test Error", "error", "Something broke");
  });

  it("adds a notification item to the store", () => {
    showError("Oops", "Details");
    const items = useNotificationStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("error");
    expect(items[0].title).toBe("Oops");
    expect(items[0].message).toBe("Details");
  });
});
