export function FranchisePoster({ url }: { url: string | null }) {
  if (!url) {
    return <span className="windows95-border bg-surface h-8 w-6 shrink-0" aria-hidden />;
  }
  return (
    <img
      src={url}
      alt=""
      className="windows95-border h-8 w-6 shrink-0 object-cover"
      loading="lazy"
    />
  );
}
