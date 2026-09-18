import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShareImportCollection } from "@/routes/components/collection/shareImport.collection";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { ShareImportPlan } from "@/types/deeplink";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const ITEMS: ShareImportPlan["link"]["items"] = [
  {
    title: "Frieren",
    type: "anime",
    year: 2023,
    status: "watching",
    externalIds: { anilist: 154587 },
    coverUrl: null,
  },
  {
    title: "Unknown Show",
    type: "movie",
    year: null,
    status: "friend_only",
    externalIds: {},
    coverUrl: null,
  },
];

const PLAN: ShareImportPlan = {
  link: { version: 1, label: "Идеи для вечера", items: ITEMS },
  statuses: [
    {
      id: "planned",
      label: "Planned,Запланировано",
      color: "#9ca3af",
      order: 0,
      isCore: true,
      kind: "private",
    },
    {
      id: "watching",
      label: "Watching,Смотрю",
      color: "#3b82f6",
      order: 1,
      isCore: true,
      kind: "private",
    },
  ],
  rows: [{ snapshot: ITEMS[0] }, { snapshot: ITEMS[1] }],
};

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ShareImportCollection plan={PLAN} onClose={onClose} />
    </QueryClientProvider>
  );
  return onClose;
}

const callsFor = (command: string) => mockInvoke.mock.calls.filter((call) => call[0] === command);

beforeEach(() => {
  useSettingsStore.setState({ language: "en", notificationsEnabled: false });
  useNotificationStore.setState({ items: [], unreadCount: 0, dismissed: [] });
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("ShareImportCollection", () => {
  it("prefills the name from the shared label and lists every row", () => {
    renderModal();
    expect(screen.getByText("Shared: Идеи для вечера (2 titles)")).toBeTruthy();
    expect(screen.getByDisplayValue("Идеи для вечера")).toBeTruthy();
    expect(screen.getByText("Frieren")).toBeTruthy();
    expect(screen.getByText("Unknown Show")).toBeTruthy();
  });

  it("creates a public status and imports the selected rows into it", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Import 2" }));

    await waitFor(() => expect(callsFor("import_collection_data")).toHaveLength(2));

    const statusCall = callsFor("upsert_collection_status")[0];
    const statusArgs = statusCall?.[1] as { status: Record<string, unknown> } | undefined;
    expect(statusArgs?.status).toMatchObject({
      isCore: false,
      kind: "public",
      label: "Идеи для вечера",
    });
    const statusId = String(statusArgs?.status.id);

    const [command, args] = callsFor("import_collection_data")[0] as [
      string,
      { data: { items: Array<Record<string, unknown>> }; strategy: string },
    ];
    expect(command).toBe("import_collection_data");
    expect(args.strategy).toBe("create_new");
    expect(args.data.items).toHaveLength(1);
    expect(args.data.items[0]).toMatchObject({
      title: "Frieren",
      status: statusId,
      externalIds: { anilist: 154587 },
      notes: null,
      localPath: null,
    });
  });

  it("reuses an existing public status with the same name", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const existing = {
      ...PLAN,
      statuses: [
        ...PLAN.statuses,
        {
          id: "share_old",
          label: "Идеи для вечера",
          color: "#0ea5e9",
          order: 9,
          isCore: false,
          kind: "public" as const,
        },
      ],
    };
    render(
      <QueryClientProvider client={queryClient}>
        <ShareImportCollection plan={existing} onClose={vi.fn()} />
      </QueryClientProvider>
    );
    await user.click(screen.getByRole("button", { name: "Import 2" }));

    await waitFor(() => expect(callsFor("import_collection_data")).toHaveLength(2));
    expect(callsFor("upsert_collection_status")).toHaveLength(0);
    const [, args] = callsFor("import_collection_data")[0] as [
      string,
      { data: { items: Array<Record<string, unknown>> } },
    ];
    expect(args.data.items[0]?.status).toBe("share_old");
  });

  it("surfaces a failed row and offers a retry without closing", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "upsert_collection_status") return undefined;
      throw new Error("db locked");
    });
    const user = userEvent.setup();
    const onClose = renderModal();
    await user.click(screen.getByRole("button", { name: "Import 2" }));

    await waitFor(() => expect(screen.getByText("Failed items (2)")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Retry failed" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports a status creation failure and stays open", async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "upsert_collection_status") throw new Error("status rejected");
      return undefined;
    });
    const user = userEvent.setup();
    const onClose = renderModal();
    await user.click(screen.getByRole("button", { name: "Import 2" }));

    await waitFor(() => {
      const errors = useNotificationStore
        .getState()
        .items.filter((item) => item.type === "error")
        .map((item) => item.message);
      expect(errors).toEqual(["status rejected"]);
    });
    expect(callsFor("import_collection_data")).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("caps the preselection at the public status limit", () => {
    const queryClient = new QueryClient();
    const many: ShareImportPlan = {
      ...PLAN,
      rows: Array.from({ length: 25 }, (_, index) => ({
        snapshot: { ...ITEMS[0], title: `Show ${index}` },
      })),
    };
    render(
      <QueryClientProvider client={queryClient}>
        <ShareImportCollection plan={many} onClose={vi.fn()} />
      </QueryClientProvider>
    );
    expect(screen.getByText("Selected 20/25")).toBeTruthy();
    expect(screen.getByText(/do not fit/)).toBeTruthy();
  });

  it("closes without invoking on cancel", async () => {
    const user = userEvent.setup();
    const onClose = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("creates the status with the shared bilingual label", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const bilingual: ShareImportPlan = {
      ...PLAN,
      link: { ...PLAN.link, label: "Ideas,Идеи" },
    };
    render(
      <QueryClientProvider client={queryClient}>
        <ShareImportCollection plan={bilingual} onClose={vi.fn()} />
      </QueryClientProvider>
    );
    expect(screen.getByDisplayValue("Ideas,Идеи")).toBeTruthy();
    expect(screen.getByText("Shared: Ideas (2 titles)")).toBeTruthy();
    expect(screen.getByText("EN: Ideas")).toBeTruthy();
    expect(screen.getByText("RU: Идеи")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Import 2" }));
    await waitFor(() => expect(callsFor("import_collection_data")).toHaveLength(2));
    const statusCall = callsFor("upsert_collection_status")[0];
    const statusArgs = statusCall?.[1] as { status: Record<string, unknown> } | undefined;
    expect(statusArgs?.status).toMatchObject({ kind: "public", label: "Ideas,Идеи" });
  });
});
