import { SmallLoader } from "@/components/shared/loader/small.loader";

export function DetailLoading() {
  return (
    <div className="flex items-center justify-center py-6">
      <SmallLoader size={5} />
    </div>
  );
}
