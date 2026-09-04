import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export function useSearchSessions() {
  const { data: sessions } = useQuery({
    queryKey: ["search_sessions"],
    queryFn: async () => {
      const [rutracker, nekobt, erai] = await Promise.all([
        invoke<boolean>("check_rutracker_session").catch(() => false),
        invoke<boolean>("check_nekobt_session").catch(() => false),
        invoke<boolean>("check_erai_session").catch(() => false),
      ]);
      return { rutracker, nekobt, erai };
    },
    staleTime: 5 * 60 * 1000,
  });
  return {
    rutrackerAuth: sessions?.rutracker ?? false,
    nekobtAuth: sessions?.nekobt ?? false,
    eraiAuth: sessions?.erai ?? false,
  };
}
