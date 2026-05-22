import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DEFAULT_RANKING_SORT,
  DEFAULT_RANKING_SORT_DIR,
  isRankingSortDir,
  isRankingSortKey,
  sortRankingRows,
  type RankingSortDir,
  type RankingSortKey,
} from "@/utils/rankingSort";

export function useRankingSort() {
  const [searchParams, setSearchParams] = useSearchParams();

  const sortBy = useMemo(() => {
    const raw = searchParams.get("ranking_ordem");
    return isRankingSortKey(raw) ? raw : DEFAULT_RANKING_SORT;
  }, [searchParams]);

  const sortDir = useMemo(() => {
    const raw = searchParams.get("ranking_direcao");
    return isRankingSortDir(raw) ? raw : DEFAULT_RANKING_SORT_DIR;
  }, [searchParams]);

  const setSortBy = useCallback(
    (value: RankingSortKey) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("ranking_ordem", value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setSortDir = useCallback(
    (value: RankingSortDir) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("ranking_direcao", value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const sortRows = useCallback(
    <T extends Record<string, unknown>>(rows: T[]) => sortRankingRows(rows, sortBy, sortDir),
    [sortBy, sortDir]
  );

  return { sortBy, sortDir, setSortBy, setSortDir, sortRows };
}
