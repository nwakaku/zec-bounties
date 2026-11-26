"use client";

import { Button } from "@/components/ui/button";

export const BOUNTY_PAGE_SIZE = 10;

interface BountyPaginationProps {
  currentPage: number;
  totalItems: number;
  hasMore: boolean;
  loading: boolean;
  onPageChange: (page: number) => void;
}

export function BountyPagination({
  currentPage,
  totalItems,
  hasMore,
  loading,
  onPageChange,
}: BountyPaginationProps) {
  if (totalItems === 0) return null;

  const pageCount = Math.max(1, Math.ceil(totalItems / BOUNTY_PAGE_SIZE));
  const visiblePageCount = Math.min(5, pageCount);
  const firstPage = Math.max(
    1,
    Math.min(currentPage - 2, pageCount - visiblePageCount + 1),
  );
  const pages = Array.from(
    { length: visiblePageCount },
    (_, index) => firstPage + index,
  );
  const startItem = (currentPage - 1) * BOUNTY_PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * BOUNTY_PAGE_SIZE, totalItems);

  return (
    <nav
      aria-label="Bounty pagination"
      className="flex flex-col items-center justify-between gap-3 border-t pt-4 sm:flex-row"
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Showing {startItem}–{endItem} of {totalItems} loaded
        {hasMore ? " · more available" : ""}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={loading || currentPage <= 1}
          aria-label="Previous page"
        >
          Previous
        </Button>
        {pages.map((page) => (
          <Button
            key={page}
            type="button"
            variant={page === currentPage ? "secondary" : "outline"}
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(page)}
            disabled={loading}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? "page" : undefined}
          >
            {page}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={loading || (currentPage >= pageCount && !hasMore)}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
