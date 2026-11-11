import { useCell } from "@hullperse/hp_utils/react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import Pagination from "@/components/shared/pagination.component";
import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { NEWS_PAGE_SIZE } from "@/config/news/feed.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useNewsFeed } from "@/hooks/news/feed.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import { newsErrorText } from "@/lib/news/error.utils";
import { consumeNewsDeepLink, deeplinkAtoms } from "@/store/deeplink.store";
import type { NewsDeepLink } from "@/types/core/deeplink";
import type { NewsItem } from "@/types/news/news";

import FeedNews from "@/routes/components/news/feed.news";
import ReaderNews from "@/routes/components/news/reader.news";

/** Shikimori news feed: one page at a time, cached for ten minutes, manual refresh. */
export default function NewsRoute() {
  const { t } = useI18n();
  const [page, setPage] = useState<number>(1);
  const [reader, setReader] = useState<NewsItem | null>(null);
  const [pending, setPending] = useState<NewsDeepLink | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const target = useCell(deeplinkAtoms.newsTarget);
  const feed = useNewsFeed(page);

  useEffect(() => {
    if (target === null) return;
    setPage(target.page);
    setPending(target);
    consumeNewsDeepLink();
  }, [target]);

  const items = feed.data?.items ?? [];
  const hasMore = feed.data?.hasMore ?? false;
  const lastPage = hasMore ? page + 1 : page;
  const from = items.length === 0 ? 0 : (page - 1) * NEWS_PAGE_SIZE + 1;
  const to = (page - 1) * NEWS_PAGE_SIZE + items.length;
  const errorText = feed.error === null ? null : newsErrorText(feed.error, t);

  useEffect(() => {
    if (pending === null || feed.data === null) return;
    if (feed.data.page !== pending.page) return;
    const found = feed.data.items.find((entry) => entry.id === pending.id);
    setPending(null);
    if (found !== undefined) setReader(found);
  }, [pending, feed.data]);

  let body: ReactNode;
  if (feed.isPending) {
    body = <TabLoader className="min-h-48 flex-1" />;
  } else if (errorText !== null && items.length === 0) {
    body = (
      <section className="flex flex-col items-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center" role="alert">
          {errorText}
        </span>
        <Button onClick={() => ignore(feed.refetch())}>{t("news.retry")}</Button>
      </section>
    );
  } else {
    body = <FeedNews items={items} onOpen={setReader} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="ui-toolbar shrink-0">
        <span className="min-w-0 flex-1" />
        <Button disabled={feed.isFetching} title={t("news.refresh")} onClick={() => feed.refresh()}>
          {feed.isFetching ? t("news.refreshing") : t("news.refresh")}
        </Button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {body}
        {errorText !== null && items.length > 0 && (
          <div className="windows95-text text-destructive px-1 py-1" role="alert">
            {errorText}
          </div>
        )}
      </div>
      <Pagination
        total={0}
        page={page}
        lastPage={lastPage}
        from={from}
        to={to}
        onPageChange={setPage}
        statusText={t("news.page", { page })}
        scrollRef={scrollRef}
      />
      {reader !== null && <ReaderNews item={reader} page={page} onClose={() => setReader(null)} />}
    </div>
  );
}
