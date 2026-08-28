import { Star } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useCollectionMutations } from "@/lib/collection.queries";
import { formatDate } from "@/lib/collection.utils";
import { useI18n } from "@/lib/i18n";
import { showError } from "@/lib/notification.utils";
import type { CollectionReview } from "@/types/collection";

export function CollectionReviewsBlock({
  reviews,
  itemId,
}: {
  reviews: CollectionReview[];
  itemId: string;
}) {
  const { t } = useI18n();
  return (
    <div className="windows95-border mt-2 bg-white p-1">
      <div className="flex items-center justify-between">
        <strong className="text-xs">{t("collection.details.reviews")}</strong>
        <span className="text-hint text-xs">{reviews.length}</span>
      </div>
      {reviews.map((rev) => (
        <div key={rev.id} className="windows95-border bg-primary mt-1 p-1">
          <div className="flex items-center gap-1">
            <span className="flex">
              {Array.from({ length: 10 }).map((_, i) => (
                <Star
                  key={i}
                  className={`size-3 ${i < rev.rating ? "fill-yellow-400 stroke-yellow-400" : "stroke-muted"}`}
                />
              ))}
            </span>
            <span className="text-xs font-bold">{rev.rating}/10</span>
            <span className="text-hint ml-auto text-xs">
              {formatDate(rev.createdAt)}
            </span>
          </div>
          <p className="mt-1 text-xs">{rev.comment}</p>
        </div>
      ))}
      <ReviewComposer itemId={itemId} />
    </div>
  );
}

export function ReviewComposer({ itemId }: { itemId: string }) {
  const { addReview } = useCollectionMutations();
  const { t } = useI18n();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!comment.trim() || saving) return;
    setSaving(true);
    try {
      await addReview(itemId, {
        rating,
        comment: comment.trim(),
        imageBlobId: null,
      });
      setComment("");
      setRating(5);
    } catch {
      showError(t("common.error"), t("collection.review.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="text-xs">{t("collection.review.yourRating")}</span>
        <span className="flex">
          {Array.from({ length: 10 }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i + 1)}
              className="p-0.5"
            >
              <Star
                className={`size-3 ${i < rating ? "fill-yellow-400 stroke-yellow-400" : "stroke-muted"}`}
              />
            </button>
          ))}
        </span>
        <span className="text-xs font-bold">{rating}/10</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("collection.review.placeholder")}
        rows={3}
        className="windows95-border w-full bg-white p-1 text-xs"
        maxLength={5000}
      />
      <div className="flex justify-end gap-1">
        <Button
          disabled={saving || !comment.trim()}
          onClick={save}
        >
          {t("collection.review.save")}
        </Button>
      </div>
    </div>
  );
}