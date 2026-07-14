import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export function useAuthCheck(command: string): boolean {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    invoke<boolean>(command)
      .then(setAuthed)
      .catch(() => setAuthed(false));
  }, [command]);

  return authed;
}
