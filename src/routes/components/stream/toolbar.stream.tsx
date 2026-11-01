import { Filter, LogIn, LogOut, RotateCw, Search, User, X } from "lucide-react";
import { useEffect, useState } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import { countActiveStreamFilters } from "@/config/player/streamFilters.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useAnimelibAccount } from "@/hooks/stream/animelibAccount.hook";
import { useCell } from "@/lib/core/signal.hook";
import { submitStreamSearch, streamPage, streamQuery } from "@/store/stream.store";
import type { StreamCatalogFilters } from "@/types/player/stream";

export default function StreamToolbar({
  isFetching,
  filters,
  onRefetch,
  onFiltersOpen,
}: {
  isFetching: boolean;
  filters: StreamCatalogFilters;
  onRefetch: () => void;
  onFiltersOpen: () => void;
}) {
  const { t } = useI18n();
  const query = useCell(streamQuery);
  const page = useCell(streamPage);
  const { account, waiting, error: loginError, login, logout } = useAnimelibAccount();
  const [text, setText] = useState<string>(query);
  const [logoutOpen, setLogoutOpen] = useState<boolean>(false);

  useEffect(() => {
    setText(query);
  }, [query]);

  const field = useSearchField({
    scope: "stream",
    query: text,
    setQuery: setText,
    onSubmit: submitStreamSearch,
    submitOnSelect: true,
  });

  const clear = () => {
    setText("");
    submitStreamSearch("");
  };
  const activeFilters = countActiveStreamFilters(filters);

  return (
    <div className="ui-toolbar ui-panel w-full flex-row">
      <InlineAutocompleteInput
        data-main-search
        placeholder={t("stream.searchPlaceholder")}
        aria-label={t("stream.searchPlaceholder")}
        className="h-9 font-bold"
        {...field.inputProps}
      />

      <Button
        size="icon"
        title={t("stream.search")}
        aria-label={t("stream.search")}
        onClick={field.handleSubmit}
        disabled={text.trim().length === 0}
      >
        <Search className="size-4" />
      </Button>
      <Button
        size="icon"
        title={t("stream.clear")}
        aria-label={t("stream.clear")}
        onClick={clear}
        disabled={text.length === 0 && query.length === 0 && page === 1}
      >
        <X className="size-4" />
      </Button>

      <span className="ui-toolbar-separator" aria-hidden />
      <Button
        size="icon"
        className="relative"
        title={t("stream.filters.button")}
        aria-label={t("stream.filters.button")}
        onClick={onFiltersOpen}
      >
        <Filter className="size-4" />
        {activeFilters > 0 && (
          <span className="bg-secondary text-title-text absolute -top-1 -right-1 flex size-3 items-center justify-center text-xs">
            {activeFilters}
          </span>
        )}
      </Button>

      <span className="ui-toolbar-separator" aria-hidden />
      <Button
        size="icon"
        title={t("stream.refresh")}
        aria-label={t("stream.refresh")}
        onClick={onRefetch}
        loading={isFetching}
      >
        <RotateCw className="size-4" />
      </Button>

      <span className="ui-toolbar-separator" aria-hidden />
      {account?.login ? (
        <Button
          variant="ghost"
          className="text-hint h-7 gap-1 px-1 text-xs"
          title={t("stream.account.logout")}
          aria-label={`${t("stream.account.logout")}: ${account.login}`}
          onClick={() => setLogoutOpen(true)}
        >
          <User className="size-3.5" />
          {account.login}
          <LogOut className="size-3.5" />
        </Button>
      ) : (
        <Button
          title={loginError ?? t("stream.login.hint")}
          aria-label={t("stream.login")}
          onClick={async () => {
            const signedIn = await login();
            if (signedIn) onRefetch();
          }}
          loading={waiting}
        >
          <LogIn className="size-4" />
          <span>{t("stream.login")}</span>
        </Button>
      )}

      {logoutOpen && (
        <ConfirmDialog
          open
          title={t("stream.account.logout.title")}
          message={t("stream.account.logout.message")}
          confirmLabel={t("stream.account.logout")}
          variant="destructive"
          onConfirm={async () => {
            setLogoutOpen(false);
            const signedOut = await logout();
            if (signedOut) onRefetch();
          }}
          onCancel={() => setLogoutOpen(false)}
          onClose={() => setLogoutOpen(false)}
        />
      )}
    </div>
  );
}
