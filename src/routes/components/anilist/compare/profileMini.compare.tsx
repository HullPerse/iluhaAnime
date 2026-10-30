import ImageComponent from "@/components/ui/image.component";

export function ProfileMini({
  avatar,
  title,
  subtitle,
}: {
  avatar: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <ImageComponent
        src={avatar}
        alt={title}
        className="windows95-active-border size-8 shrink-0 object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="windows95-text truncate text-xs font-bold">{title}</p>
        <p className="windows95-text text-hint text-xs">{subtitle}</p>
      </div>
    </div>
  );
}
