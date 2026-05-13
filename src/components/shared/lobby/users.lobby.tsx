import { LobbyStateInfo } from "@/types";

function Users({ state, current }: { state: LobbyStateInfo; current: string }) {
  return (
    <main className="flex flex-col gap-1 p-1">
      {state.users.map((user, index) => (
        <span
          key={user.id}
          className="windows95-text windows95-border p-0.5 line-clamp-1"
        >
          {index + 1}. {user.username || user.id} [
          {user.id === current && "ХОСТ"}]
        </span>
      ))}
    </main>
  );
}

export default Users;
