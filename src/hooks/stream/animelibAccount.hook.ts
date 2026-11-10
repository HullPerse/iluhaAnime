import { useCallback, useEffect, useState } from "react";

import { streamApi } from "@/api/stream.api";
import { ANIMELIB_LOGIN_ERRORS } from "@/config/settings/animelibLogin.config";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt } from "@hullperse/hp_utils/attempt";
import { ignore } from "@/lib/core/shared/promise.utils";
import type { AnimeLibAccount } from "@/types/api/stream";

export function useAnimelibAccount() {
  const { t } = useI18n();
  const [account, setAccount] = useState<AnimeLibAccount | null>(null);
  const [waiting, setWaiting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [value, failure] = await attempt(streamApi.account());
    if (failure) {
      setError(failure.message);
      return;
    }
    setAccount(value);
  }, []);

  useEffect(() => {
    ignore(refresh());
  }, [refresh]);

  const login = async (): Promise<boolean> => {
    if (waiting) return false;
    setWaiting(true);
    setError(null);
    const [, openFailure] = await attempt(streamApi.webviewLogin());
    if (openFailure) {
      setWaiting(false);
      const knownKey = ANIMELIB_LOGIN_ERRORS[openFailure.message];
      setError(knownKey ? t(knownKey) : openFailure.message);
      return false;
    }
    const [, finishFailure] = await attempt(streamApi.finishWebviewLogin());
    setWaiting(false);
    if (finishFailure) {
      const knownKey = ANIMELIB_LOGIN_ERRORS[finishFailure.message];
      setError(knownKey ? t(knownKey) : finishFailure.message);
      return false;
    }
    await refresh();
    return true;
  };

  const logout = async (): Promise<boolean> => {
    const previous = account;
    setError(null);
    // The token is gone the moment the command runs; the extra account request
    // only put a network hop between the click and the signed-out header.
    setAccount(null);
    const [, failure] = await attempt(streamApi.tokenClear());
    if (failure) {
      setAccount(previous);
      setError(failure.message);
      return false;
    }
    return true;
  };

  return { account, waiting, error, login, logout, refresh };
}
