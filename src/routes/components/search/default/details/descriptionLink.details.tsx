import { openUrl } from "@tauri-apps/plugin-opener";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";

export function DescriptionLink({ text, href }: { text: string; href: string }) {
  const open = async () => {
    const [, openError] = await attempt(openUrl(href));
    if (openError) reportBackgroundError("details.open-link", openError);
  };
  return (
    <button
      type="button"
      className="text-highlight cursor-pointer text-xs underline hover:brightness-110"
      onClick={() => open()}
      title={href}
    >
      {text}
    </button>
  );
}
