"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { BountyCard } from "@/components/bounty-card";
import {
  BOUNTY_PAGE_SIZE,
  BountyPagination,
} from "@/components/bounty-pagination";
import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  List,
  Grid3X3,
  Plus,
  ArrowRight,
  Loader2,
  Ban,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Coins,
  ExternalLink,
  Search,
  Trophy,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NewBountyModal } from "@/components/new-bounty-modal";
import { BountyDetailModal } from "@/components/bounty-detail-modal";
import { RepoFilter } from "@/components/repo-filter";
import {
  FilterPanel,
  FilterSection,
  FilterChip,
  FilterSelect,
  filterFieldClass,
} from "@/components/filter-panel";
import { bountyRepo } from "@/lib/repos";
import { Bounty } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import type { BountyStatus } from "@/lib/types";
import {
  DEFAULT_BOUNTY_BOARD_FILTERS,
  filterAndSortBounties,
  readBountyBoardFilters,
  writeBountyBoardFilters,
  type BountyBoardFilters,
} from "@/lib/bounty-filters";
import { formatStatus } from "@/lib/utils";
import { MobileNavShell } from "@/components/layout/mobile-nav-shell";
import { useTaskCreationBlocked } from "@/hooks/use-task-creation-blocked";
import { formatDistanceToNow } from "date-fns";
// import { useRoleGuard } from "@/hooks/use-role-guard";

const KANBAN_COLUMNS: {
  status: BountyStatus;
  label: string;
  color: string;
  dotColor: string;
}[] = [
  {
    status: "TO_DO",
    label: "Todo",
    color: "border-t-slate-400",
    dotColor: "bg-slate-400",
  },
  {
    status: "IN_PROGRESS",
    label: "In Progress",
    color: "border-t-blue-500",
    dotColor: "bg-blue-500",
  },
  {
    status: "IN_REVIEW",
    label: "In Review",
    color: "border-t-yellow-500",
    dotColor: "bg-yellow-500",
  },
  {
    status: "DONE",
    label: "Done",
    color: "border-t-green-500",
    dotColor: "bg-green-500",
  },
];

// Windows 98-style defrag map colors (inspired by classic Disk Defragmenter)
const DEFRAG_STATUS_COLORS: Record<BountyStatus, string> = {
  TO_DO: "bg-cyan-400", // free / pending
  IN_PROGRESS: "bg-blue-800", // allocated / in use
  IN_REVIEW: "bg-red-500", // fragmented / needs attention
  DONE: "bg-blue-500", // contiguous / completed
  CANCELLED: "bg-zinc-700",
};

const DEFRAG_LEGEND: { status: BountyStatus; label: string; color: string }[] =
  [
    { status: "TO_DO", label: "Todo", color: "bg-cyan-400" },
    { status: "IN_PROGRESS", label: "In Progress", color: "bg-blue-800" },
    { status: "IN_REVIEW", label: "In Review", color: "bg-red-500" },
    { status: "DONE", label: "Done", color: "bg-blue-500" },
    { status: "CANCELLED", label: "Cancelled", color: "bg-zinc-700" },
  ];

// Order for defrag map so same-status blocks form contiguous runs (classic look)
const STATUS_ORDER: BountyStatus[] = [
  "TO_DO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
];

// YYYY-MM-DD in the user's local timezone, `days` from today
const dateInDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
};

const DEADLINE_PRESETS = [
  { label: "This week", days: 7 },
  { label: "This month", days: 30 },
];

const DAO_PROPOSAL_CONTRACT =
  "juno14futcfehnc8fn4nz6gtm25svn05mzz09ju8rtj0jvven2hpxj85s0q8a55";
const DAO_PROPOSALS_URL =
  "https://daodao.zone/dao/juno1nktrulhakwm0n3wlyajpwxyg54n39xx4y8hdaqlty7mymf85vweq7m6t0y/proposals";
const TOP_EARNERS_VISIBLE_COUNT = 5;
const TOP_EARNER_ROW_HEIGHT = 44;

interface DaoProposal {
  id: number;
  proposal: {
    title: string;
    status: string;
  };
}

interface DaoProposalResponse {
  data?: {
    proposals?: DaoProposal[];
  };
}

function HomeContent() {
  const taskCreationBlocked = useTaskCreationBlocked();
  const { bountyQuota } = useBounty();
  const {
    bounties,
    currentUser,
    categories,
    communities,
    bountiesLoading,
    loadMoreBounties,
    loadAllBounties,
    hasMoreBounties,
    fetchBountyById,
    teamBounties,
    teamBountiesLoading,
    teamBountiesHasMore,
    fetchTeamBounties,
    loadMoreTeamBounties,
    leaderboard,
    fetchLeaderboard,
  } = useBounty();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<BountyBoardFilters>(() =>
    readBountyBoardFilters(searchParams),
  );
  const [filterLoadError, setFilterLoadError] = useState(false);
  const [filterLoadRetry, setFilterLoadRetry] = useState(0);
  const filterLoadStarted = useRef(false);
  const leaderboardFetchStarted = useRef(false);
  const [daoProposals, setDaoProposals] = useState<DaoProposal[]>([]);
  const [daoProposalsLoading, setDaoProposalsLoading] = useState(true);
  const [daoProposalsError, setDaoProposalsError] = useState(false);
  const [topEarnerIndex, setTopEarnerIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "defrag">("list");
  const [isNewBountyModalOpen, setIsNewBountyModalOpen] = useState(false);
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const {
    category: activeCategory,
    repo: activeRepo,
    teamId: activeTeamId,
    query: searchQuery,
  } = filters;

  const updateFilter = <K extends keyof BountyBoardFilters>(
    key: K,
    value: BountyBoardFilters[K],
  ) => {
    const nextFilters = { ...filters, [key]: value };
    setFilters(nextFilters);
    const params = writeBountyBoardFilters(
      new URLSearchParams(window.location.search),
      nextFilters,
    );
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${pathname}${query ? `?${query}` : ""}`,
    );
  };

  const searchParamString = searchParams.toString();
  useEffect(() => {
    setFilters(readBountyBoardFilters(new URLSearchParams(searchParamString)));
  }, [searchParamString]);
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, activeTeamId]);

  // currentUser is guaranteed non-null here — ProtectedRoute handles the gate
  const displayCategories = ["All", ...categories.map((c) => c.name)];
  const filterTeams = useMemo(() => {
    const byId = new Map(communities.map((team) => [team.id, team]));
    for (const bounty of bounties) {
      if (bounty.teamId && bounty.team && !byId.has(bounty.teamId)) {
        byId.set(bounty.teamId, {
          id: bounty.teamId,
          name: bounty.team.name,
          description: null,
          memberCount: 0,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [communities, bounties]);

  useEffect(() => {
    if (activeTeamId) fetchTeamBounties(activeTeamId);
  }, [activeTeamId]);

  const sourceBounties = activeTeamId
    ? (teamBounties[activeTeamId] ?? [])
    : bounties;
  const sourceLoading = activeTeamId
    ? !!teamBountiesLoading[activeTeamId]
    : bountiesLoading;
  const sourceHasMore = activeTeamId
    ? !!teamBountiesHasMore[activeTeamId]
    : hasMoreBounties;

  const categoryFilteredBounties = useMemo(() => {
    return filterAndSortBounties(sourceBounties, {
      ...filters,
      repo: "all",
      sort: "newest",
    });
  }, [sourceBounties, filters]);

  const repoCounts = useMemo(() => {
    const counts = {
      namada: 0,
      zechub: 0,
      "zechub-wiki": 0,
      "zec-bounties": 0,
      untagged: 0,
    };
    for (const bounty of categoryFilteredBounties) {
      const repo = bountyRepo(bounty);
      if (repo) counts[repo] += 1;
      else counts.untagged += 1;
    }
    return counts;
  }, [categoryFilteredBounties]);

  const filteredBounties = useMemo(
    () => filterAndSortBounties(sourceBounties, filters),
    [sourceBounties, filters],
  );

  const paginatedBounties = useMemo(
    () =>
      filteredBounties.slice(
        (currentPage - 1) * BOUNTY_PAGE_SIZE,
        currentPage * BOUNTY_PAGE_SIZE,
      ),
    [filteredBounties, currentPage],
  );

  const kanbanGroups = useMemo(
    () =>
      KANBAN_COLUMNS.map((col) => ({
        ...col,
        bounties: paginatedBounties.filter((b) => b.status === col.status),
      })),
    [paginatedBounties],
  );

  const defragBounties = useMemo(() => {
    return [...paginatedBounties].sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      return (
        new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
      );
    });
  }, [paginatedBounties]);

  const missingUA = !currentUser?.UA_address;
  const topEarnerVisibleCount = Math.min(
    TOP_EARNERS_VISIBLE_COUNT,
    leaderboard.length,
  );
  const maxTopEarnerIndex = Math.max(
    0,
    leaderboard.length - topEarnerVisibleCount,
  );
  const visibleTopEarnerIndex = Math.min(topEarnerIndex, maxTopEarnerIndex);

  useEffect(() => {
    if (leaderboardFetchStarted.current) return;
    leaderboardFetchStarted.current = true;
    void fetchLeaderboard({ timeRange: "all", chain: "MAIN", limit: 10 });
  }, [fetchLeaderboard]);

  useEffect(() => {
    const controller = new AbortController();
    const query = btoa(JSON.stringify({ reverse_proposals: { limit: 3 } }));

    fetch(
      `https://juno-api.polkachu.com/cosmwasm/wasm/v1/contract/${DAO_PROPOSAL_CONTRACT}/smart/${query}`,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error("Failed to fetch DAO proposals");
        return response.json() as Promise<DaoProposalResponse>;
      })
      .then((result) => {
        if (!Array.isArray(result.data?.proposals)) {
          throw new Error("Invalid DAO proposal response");
        }
        setDaoProposals(result.data.proposals.slice(0, 3));
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Failed to fetch DAO proposals:", error);
        setDaoProposalsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDaoProposalsLoading(false);
      });

    return () => controller.abort();
  }, []);

  const recentBounties = useMemo(
    () =>
      [...sourceBounties]
        .sort(
          (a, b) =>
            new Date(b.updatedAt ?? b.dateCreated).getTime() -
            new Date(a.updatedAt ?? a.dateCreated).getTime(),
        )
        .slice(0, 5),
    [sourceBounties],
  );
  const openBountyCount = sourceBounties.filter(
    (bounty) => bounty.status === "TO_DO",
  ).length;
  const visibleRewards = sourceBounties.reduce(
    (total, bounty) => total + bounty.bountyAmount,
    0,
  );

  // Open a bounty and reflect it in the URL
  const openBounty = (bounty: Bounty) => {
    setSelectedBounty(bounty);
    setIsDetailModalOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("bounty", bounty.id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const closeBounty = () => {
    setIsDetailModalOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("bounty");
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };

  const getCategoryCount = (name: string) =>
    name === "All"
      ? sourceBounties.length
      : sourceBounties.filter((b) => b.categoryId === name).length;

  const handleLoadMore = useCallback(async (): Promise<boolean> => {
    if (isLoadingMore || sourceLoading) return false;
    setIsLoadingMore(true);
    try {
      if (activeTeamId) return await loadMoreTeamBounties(activeTeamId);
      return await loadMoreBounties();
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    isLoadingMore,
    sourceLoading,
    loadMoreBounties,
    loadMoreTeamBounties,
    activeTeamId,
  ]);

  const handleNewBounty = () => {
    if (taskCreationBlocked) {
      toast.error("Task creation disabled", {
        description: "An admin has blocked your account from creating tasks.",
      });
      return;
    }
    if (!currentUser?.UA_address) {
      toast.warning("Unified Address required", {
        description: "Add a UA to your profile before creating a bounty.",
        action: {
          label: "Go to profile",
          onClick: () => router.push("/profile"),
        },
        duration: 5000,
      });
      return;
    }
    setIsNewBountyModalOpen(true);
  };

  const requiresCompleteResults =
    filters.query.trim() !== "" ||
    filters.category !== "All" ||
    filters.repo !== "all" ||
    filters.minReward != null ||
    filters.maxReward != null ||
    filters.deadline !== "" ||
    filters.status !== "" ||
    filters.sort !== "newest";

  const activeFilterCount = [
    filters.category !== "All",
    filters.repo !== "all",
    filters.minReward != null,
    filters.maxReward != null,
    filters.deadline !== "",
    filters.status !== "",
    filters.teamId !== "",
    filters.sort !== "newest",
  ].filter(Boolean).length;

  const clearFilters = () => {
    const nextFilters = { ...DEFAULT_BOUNTY_BOARD_FILTERS };
    setFilters(nextFilters);
    const params = writeBountyBoardFilters(
      new URLSearchParams(window.location.search),
      nextFilters,
    );
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${pathname}${query ? `?${query}` : ""}`,
    );
  };

  useEffect(() => {
    if (activeTeamId) return;
    if (!requiresCompleteResults) {
      filterLoadStarted.current = false;
      setFilterLoadError(false);
      return;
    }
    if (!hasMoreBounties || bountiesLoading || filterLoadStarted.current)
      return;

    filterLoadStarted.current = true;
    setFilterLoadError(false);
    void loadAllBounties().then((loaded) => {
      if (!loaded) setFilterLoadError(true);
    });
  }, [
    requiresCompleteResults,
    hasMoreBounties,
    bountiesLoading,
    loadAllBounties,
    filterLoadRetry,
    activeTeamId,
  ]);

  const canLoadNextPage = sourceHasMore && !requiresCompleteResults;
  const handlePageChange = async (page: number) => {
    const loadedPageCount = Math.max(
      1,
      Math.ceil(filteredBounties.length / BOUNTY_PAGE_SIZE),
    );
    if (page < 1 || page > loadedPageCount + 1) return;
    if (page <= loadedPageCount) {
      setCurrentPage(page);
      return;
    }
    if (!canLoadNextPage || sourceLoading || isLoadingMore) return;
    if (await handleLoadMore()) setCurrentPage(page);
  };

  useEffect(() => {
    const loadedPageCount = Math.max(
      1,
      Math.ceil(filteredBounties.length / BOUNTY_PAGE_SIZE),
    );
    if (currentPage > loadedPageCount) setCurrentPage(loadedPageCount);
  }, [currentPage, filteredBounties.length]);

  // On load / when the URL param changes, open the matching bounty
  useEffect(() => {
    const bountyId = searchParams.get("bounty");
    if (!bountyId) return;

    // Prefer the copy already in the list (avoids a flash of stale data)
    const inMemory = bounties.find((b) => b.id === bountyId);
    if (inMemory) {
      setSelectedBounty(inMemory);
      setIsDetailModalOpen(true);
      return;
    }

    // Fall back to a direct fetch — handles deep links before bounties load,
    // or bounties the current filtered list doesn't include
    fetchBountyById(bountyId).then((bounty) => {
      if (bounty) {
        setSelectedBounty(bounty);
        setIsDetailModalOpen(true);
      }
    });
  }, [searchParams, bounties, fetchBountyById]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={(value) => updateFilter("query", value)}
      />

      <div className="mx-auto w-full max-w-[1360px] px-3 py-5 sm:px-5 sm:py-7">
        <section className="mb-5 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 via-violet-600 to-indigo-600 px-5 py-5 text-white shadow-sm sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border border-white/30">
                <AvatarImage
                  src={currentUser?.avatar || undefined}
                  alt=""
                />
                <AvatarFallback className="bg-white/20 text-white">
                  {currentUser?.name?.charAt(0).toUpperCase() ?? "Z"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold text-white/75">
                  ZEC Bounties
                </p>
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                  Welcome back
                  {currentUser?.nickname || currentUser?.name
                    ? `, ${currentUser.nickname || currentUser.name}`
                    : ""}
                </h1>
                <p className="mt-0.5 text-sm text-white/75">
                  Find meaningful work and earn ZEC for your contribution.
                </p>
              </div>
            </div>
            <div className="flex gap-2 sm:shrink-0">
              <Button
                title={
                  taskCreationBlocked
                    ? bountyQuota?.postEligibility?.mode === "closed"
                      ? "Bounty suggestions are currently closed"
                      : bountyQuota?.postEligibility?.allowed === false
                        ? `Complete ${bountyQuota.postEligibility.required} bounties to post your own`
                        : "An admin has disabled task creation for your account"
                    : undefined
                }
                className={`w-full bg-white text-violet-700 hover:bg-white/90 sm:w-auto ${
                  taskCreationBlocked ? "opacity-50" : ""
                }`}
                onClick={handleNewBounty}
              >
                {taskCreationBlocked ? (
                  <Ban className="mr-2 h-4 w-4" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}{" "}
                New Bounty
              </Button>
              <Link href="/my-bounties" className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  className="w-full border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto"
                >
                  My Bounties <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <NewBountyModal
          open={isNewBountyModalOpen}
          onOpenChange={setIsNewBountyModalOpen}
          onSuccess={() => setIsNewBountyModalOpen(false)}
          onCancel={() => setIsNewBountyModalOpen(false)}
        />
        <BountyDetailModal
          bounty={selectedBounty}
          open={isDetailModalOpen}
          onOpenChange={(open) =>
            open ? setIsDetailModalOpen(true) : closeBounty()
          }
        />

        <div className="grid min-w-0 grid-cols-1 gap-7 md:grid-cols-[minmax(0,1fr)_260px] md:gap-6 xl:grid-cols-[minmax(0,1fr)_292px] xl:gap-8">
          <div className="min-w-0 space-y-6">
            <div className="space-y-6 min-w-0 flex-1">
              <section id="opportunities" className="scroll-mt-20">
                <div className="mb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                      Browse opportunities
                    </p>
                    <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                      Find your next bounty
                    </h2>
                  </div>
                  <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
                    {displayCategories.map((category) => (
                      <FilterChip
                        key={category}
                        active={activeCategory === category}
                        onClick={() => updateFilter("category", category)}
                        count={getCategoryCount(category)}
                      >
                        {category}
                      </FilterChip>
                    ))}
                  </div>
                </div>
              </section>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pb-3 sm:pb-4 border-b">
                <h2 className="truncate text-base sm:text-xl font-bold">
                  {activeTeamId
                    ? `${communities.find((c) => c.id === activeTeamId)?.name ?? "Team"} Bounties`
                    : activeCategory === "All"
                      ? "All Bounties"
                      : `${activeCategory} Bounties`}
                </h2>

                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                  <FilterPanel
                    activeCount={activeFilterCount}
                    onClear={clearFilters}
                    applyLabel={`Show ${filteredBounties.length} bounties`}
                    loading={
                      bountiesLoading &&
                      hasMoreBounties &&
                      requiresCompleteResults
                    }
                  >
                    <FilterSection label="Category">
                      <div className="flex flex-wrap gap-2">
                        {displayCategories.map((cat) => (
                          <FilterChip
                            key={cat}
                            active={activeCategory === cat}
                            onClick={() => updateFilter("category", cat)}
                            count={getCategoryCount(cat)}
                          >
                            {cat}
                          </FilterChip>
                        ))}
                      </div>
                    </FilterSection>

                    <FilterSection label="Repository">
                      <RepoFilter
                        value={activeRepo}
                        onChange={(repo) => updateFilter("repo", repo)}
                        counts={repoCounts}
                      />
                    </FilterSection>

                    <div className="grid grid-cols-1 gap-3 sam:grid-cols-2">
                      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                        Min reward
                        <div className="relative">
                          <input
                            aria-label="Minimum reward"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={filters.minReward ?? ""}
                            onChange={(e) =>
                              updateFilter(
                                "minReward",
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                            className={`${filterFieldClass} pr-12 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                            ZEC
                          </span>
                        </div>
                      </label>
                      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                        Max reward
                        <div className="relative">
                          <input
                            aria-label="Maximum reward"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            placeholder="Any"
                            value={filters.maxReward ?? ""}
                            onChange={(e) =>
                              updateFilter(
                                "maxReward",
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                            className={`${filterFieldClass} pr-12 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                            ZEC
                          </span>
                        </div>
                      </label>

                      <div className="flex min-w-0 flex-col gap-1.5 sam:col-span-2">
                        <label
                          htmlFor="filter-deadline"
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Deadline (on or before)
                        </label>
                        <input
                          id="filter-deadline"
                          type="date"
                          value={filters.deadline}
                          onChange={(e) =>
                            updateFilter("deadline", e.target.value)
                          }
                          className={`${filterFieldClass} dark:[color-scheme:dark]`}
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          {DEADLINE_PRESETS.map((preset) => {
                            const presetValue = dateInDays(preset.days);
                            const active = filters.deadline === presetValue;
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() =>
                                  updateFilter(
                                    "deadline",
                                    active ? "" : presetValue,
                                  )
                                }
                                className={`h-7 rounded-full border px-3 text-xs transition ${
                                  active
                                    ? "border-primary bg-primary/10 font-semibold text-primary"
                                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                                }`}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                          {filters.deadline !== "" && (
                            <button
                              type="button"
                              onClick={() => updateFilter("deadline", "")}
                              className="h-7 rounded-full px-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            >
                              Clear date
                            </button>
                          )}
                        </div>
                      </div>

                      <FilterSelect
                        label="Status"
                        value={filters.status}
                        options={[
                          { value: "", label: "All statuses" },
                          { value: "open", label: "Open" },
                          { value: "assigned", label: "Assigned" },
                          { value: "in_review", label: "In review" },
                        ]}
                        onChange={(v) =>
                          updateFilter(
                            "status",
                            v as BountyBoardFilters["status"],
                          )
                        }
                      />
                      <FilterSelect
                        label="Sort by"
                        value={filters.sort}
                        options={[
                          { value: "newest", label: "Newest" },
                          { value: "highest_reward", label: "Highest reward" },
                          {
                            value: "soonest_deadline",
                            label: "Soonest deadline",
                          },
                        ]}
                        onChange={(v) =>
                          updateFilter("sort", v as BountyBoardFilters["sort"])
                        }
                      />
                      <FilterSelect
                        className="sam:col-span-2"
                        label="Team"
                        value={filters.teamId}
                        options={[
                          { value: "", label: "All teams" },
                          ...filterTeams.map((team) => ({
                            value: team.id,
                            label: team.name,
                          })),
                        ]}
                        onChange={(v) => updateFilter("teamId", v)}
                      />
                    </div>
                  </FilterPanel>
                  <div className="mx-1 hidden h-5 w-px bg-border sam:block" />
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("grid")}
                    title="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("list")}
                    title="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "defrag" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("defrag")}
                    title="Defrag map view"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {requiresCompleteResults && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span aria-live="polite">
                    {bountiesLoading && hasMoreBounties
                      ? "Loading all bounties for complete filter results…"
                      : filterLoadError
                        ? "Could not load all bounties. Showing the results currently available."
                        : `${filteredBounties.length} matching bounties`}
                  </span>
                  {filterLoadError && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        filterLoadStarted.current = false;
                        setFilterLoadRetry((attempt) => attempt + 1);
                        setFilterLoadError(false);
                      }}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}

              {sourceLoading && sourceBounties.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 sm:py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">Loading bounties...</p>
                </div>
              ) : filteredBounties.length === 0 ? (
                <div className="text-center py-12 sm:py-20 px-4 border rounded-xl bg-muted/20">
                  <p className="text-muted-foreground">
                    No bounties found
                    {activeCategory !== "All" ? ` in ${activeCategory}` : ""}
                    {searchQuery ? " matching your search" : ""}.
                  </p>
                </div>
              ) : viewMode === "grid" ? (
                <div className="overflow-x-auto pb-4 -mx-1 px-1">
                  <div className="flex gap-3 sm:gap-4 items-start min-w-max snap-x snap-mandatory">
                    {kanbanGroups.map((col) => (
                      <div
                        key={col.status}
                        className="snap-start flex flex-col gap-3 w-[80vw] max-w-72 sm:w-72 flex-shrink-0"
                      >
                        <div
                          className={`rounded-lg border border-t-2 bg-muted/30 px-3 py-2 flex items-center justify-between ${col.color}`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${col.dotColor}`}
                            />
                            <span className="text-sm font-semibold">
                              {col.label}
                            </span>
                          </div>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5 px-1.5"
                          >
                            {col.bounties.length}
                          </Badge>
                        </div>
                        <div className="flex flex-col gap-3">
                          {col.bounties.length === 0 ? (
                            <div className="rounded-lg border border-dashed bg-muted/10 py-8 flex items-center justify-center">
                              <p className="text-xs text-muted-foreground">
                                No bounties
                              </p>
                            </div>
                          ) : (
                            col.bounties.map((bounty) => (
                              <BountyCard
                                key={bounty.id}
                                bounty={bounty}
                                viewMode="kanban"
                                onClick={() => openBounty(bounty)}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : viewMode === "list" ? (
                <div className="space-y-8">
                  {kanbanGroups
                    .filter((col) => col.bounties.length > 0)
                    .map((col) => (
                      <div key={col.status} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${col.dotColor}`}
                          />
                          <h3 className="text-sm font-semibold">{col.label}</h3>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-5 px-1.5"
                          >
                            {col.bounties.length}
                          </Badge>
                          <div className="flex-1 border-t border-border/50 ml-1" />
                        </div>
                        <div className="flex flex-col gap-2">
                          {col.bounties.map((bounty) => (
                            <BountyCard
                              key={bounty.id}
                              bounty={bounty}
                              viewMode="list"
                              onClick={() => openBounty(bounty)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                // defrag view
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    {DEFRAG_LEGEND.map((item) => (
                      <div
                        key={item.status}
                        className="flex items-center gap-1.5"
                      >
                        <span
                          className={`inline-block h-3 w-3 border border-black/80 ${item.color}`}
                        />
                        <span>{item.label}</span>
                      </div>
                    ))}
                    <span className="w-full sm:w-auto sm:ml-auto text-[11px] opacity-70">
                      {paginatedBounties.length} bounties · click a block to open
                    </span>
                  </div>
                  <div
                    className="rounded border border-border bg-black p-1.5 overflow-hidden"
                    style={{
                      // Classic dense map look
                      imageRendering: "pixelated",
                    }}
                  >
                    <div className="grid gap-px [grid-template-columns:repeat(auto-fill,10px)] sm:[grid-template-columns:repeat(auto-fill,14px)] justify-start">
                      {defragBounties.map((bounty) => {
                        const color =
                          DEFRAG_STATUS_COLORS[bounty.status] ?? "bg-zinc-600";
                        return (
                          <button
                            key={bounty.id}
                            type="button"
                            title={`${bounty.title} — ${formatStatus(bounty.status)}`}
                            onClick={() => openBounty(bounty)}
                            className={`
                              relative h-[10px] w-[10px] sm:h-[14px] sm:w-[14px]
                              border border-black/90 ${color}
                              hover:z-10 hover:scale-[1.8] hover:border-white
                              focus:outline-none focus:ring-1 focus:ring-white
                              transition-transform duration-75
                              cursor-pointer
                            `}
                          >
                            {/* center "data" pixel for Done / In Progress (classic map look) */}
                            {(bounty.status === "DONE" ||
                              bounty.status === "IN_PROGRESS") && (
                              <span className="absolute inset-0 m-auto h-1 w-1 rounded-full bg-white/80 pointer-events-none" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <BountyPagination
                currentPage={currentPage}
                totalItems={filteredBounties.length}
                hasMore={canLoadNextPage}
                loading={isLoadingMore || sourceLoading}
                onPageChange={handlePageChange}
              />

              <section id="grants" className="scroll-mt-20 pt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                      Community funding
                    </p>
                    <h2 className="mt-1 text-xl font-bold tracking-tight">
                      Grants
                    </h2>
                  </div>
                  <a
                    href={DAO_PROPOSALS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    View proposals <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
                {daoProposalsLoading ? (
                  <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                    Loading recent proposals…
                  </p>
                ) : daoProposalsError ? (
                  <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                    Recent proposals could not be loaded. Use “View proposals”
                    to see them on DAO DAO.
                  </p>
                ) : daoProposals.length === 0 ? (
                  <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                    No proposals are available right now.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {daoProposals.map(({ id, proposal }) => (
                      <li key={id}>
                        <a
                          href={`${DAO_PROPOSALS_URL}/${id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Trophy className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium leading-snug group-hover:text-primary">
                              {proposal.title}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Proposal #{id}
                            </span>
                          </span>
                          <Badge
                            variant="secondary"
                            className="shrink-0 capitalize"
                          >
                            {proposal.status.replaceAll("_", " ")}
                          </Badge>
                          <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </a>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>

          <aside className="space-y-5">
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Open bounties</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {openBountyCount}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Loaded rewards</p>
                <p className="mt-1 flex items-center gap-1.5 text-xl font-bold tabular-nums">
                  <Coins className="h-4 w-4 text-primary" />
                  {visibleRewards.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                </p>
                <p className="text-[11px] text-muted-foreground">ZEC</p>
              </div>
            </section>

            <section className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold">How it works</h2>
              <ol className="mt-4 space-y-4">
                {[
                  {
                    title: "Complete your profile",
                    description: "Add your skills and a payout address.",
                    icon: UserRound,
                    iconClass: "text-sky-600",
                  },
                  {
                    title: "Choose a bounty",
                    description: "Apply to tasks that match your experience.",
                    icon: Search,
                    iconClass: "text-violet-600",
                  },
                  {
                    title: "Get paid in ZEC",
                    description:
                      "Submit approved work and receive your reward.",
                    icon: Coins,
                    iconClass: "text-amber-600",
                  },
                ].map(({ title, description, icon: StepIcon, iconClass }) => (
                  <li key={title} className="flex gap-3">
                    <StepIcon
                      className={`mt-0.5 h-5 w-5 shrink-0 ${iconClass}`}
                    />
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              {missingUA && (
                <Link
                  href="/profile"
                  className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Complete your profile <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </section>

            <section className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 id="top-earners-title" className="text-sm font-semibold">
                  Top earners
                </h2>
                <Link
                  href="/leaderboard"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Leaderboard <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {leaderboard.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">
                  Leaderboard data is not available right now.
                </p>
              ) : (
                <>
                  <div className="mb-1.5 mt-2 flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">
                      Ranks {visibleTopEarnerIndex + 1}–
                      {visibleTopEarnerIndex + topEarnerVisibleCount} of{" "}
                      {leaderboard.length}
                    </p>
                    <div className="flex items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Show previous top earners"
                        disabled={visibleTopEarnerIndex === 0}
                        onClick={() =>
                          setTopEarnerIndex(visibleTopEarnerIndex - 1)
                        }
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Show next top earners"
                        disabled={visibleTopEarnerIndex === maxTopEarnerIndex}
                        onClick={() =>
                          setTopEarnerIndex(visibleTopEarnerIndex + 1)
                        }
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div
                    role="region"
                    aria-labelledby="top-earners-title"
                    aria-roledescription="carousel"
                    className="overflow-hidden"
                    style={{
                      height: `${topEarnerVisibleCount * TOP_EARNER_ROW_HEIGHT}px`,
                    }}
                  >
                    <ol
                      className="divide-y transition-transform duration-300 ease-out motion-reduce:transition-none"
                      style={{
                        transform: `translateY(-${visibleTopEarnerIndex * TOP_EARNER_ROW_HEIGHT}px)`,
                      }}
                    >
                      {leaderboard.map((earner, index) => (
                        <li
                          key={earner.id}
                          className="flex h-11 items-center gap-2.5"
                        >
                          <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage
                              src={earner.avatar ?? undefined}
                              alt=""
                            />
                            <AvatarFallback className="text-[10px]">
                              {earner.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">
                            {earner.nickname || earner.name}
                          </span>
                          <span
                            aria-label={
                              earner.completed == null
                                ? "Count unavailable"
                                : `Count ${earner.completed.toLocaleString()}`
                            }
                            className="shrink-0 text-xs tabular-nums text-muted-foreground"
                          >
                            {earner.completed == null
                              ? "—"
                              : earner.completed.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recently updated</h2>
                <span className="text-xs text-muted-foreground">
                  {recentBounties.length}
                </span>
              </div>
              {recentBounties.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">
                  New bounty activity will appear here.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recentBounties.map((bounty) => (
                    <li key={bounty.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Coins className="h-3.5 w-3.5 text-primary" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => openBounty(bounty)}
                          className="line-clamp-2 text-left text-xs font-medium hover:text-primary"
                        >
                          {bounty.title}
                        </button>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatDistanceToNow(
                            new Date(bounty.updatedAt ?? bounty.dateCreated),
                            { addSuffix: true },
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>

      <footer className="mt-10 border-t bg-muted/20">
        <div className="mx-auto grid w-full max-w-[1360px] gap-8 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_repeat(3,140px)]">
          <div>
            <Link href="/home" className="text-lg font-bold tracking-tight">
              <span className="text-primary">ZEC</span> Bounties
            </Link>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Discover open-source work and community grants across the Zcash ecosystem. Contribute, collaborate, and earn ZEC.
            </p>
            <a
              href="https://zechub.wiki"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Explore ZecHub <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide">Opportunities</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a href="#opportunities" className="hover:text-foreground">Bounties</a></li>
              <li><Link href="/my-bounties" className="hover:text-foreground">My Bounties</Link></li>
              <li><a href="#grants" className="hover:text-foreground">Grants</a></li>
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide">Explore</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/leaderboard" className="hover:text-foreground">Leaderboard</Link></li>
              <li><Link href="/teams" className="hover:text-foreground">Teams</Link></li>
              <li><Link href="/docs" className="hover:text-foreground">Documentation</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide">About</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/docs/faq" className="hover:text-foreground">FAQ</Link></li>
              <li><Link href="/docs/privacy-payments" className="hover:text-foreground">Privacy &amp; payments</Link></li>
              <li><Link href="/docs/contributors" className="hover:text-foreground">Contributors</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t">
          <p className="mx-auto w-full max-w-[1360px] px-4 py-3 text-xs text-muted-foreground sm:px-6">
            © {new Date().getFullYear()} ZEC Bounties. Built for the Zcash community.
          </p>
        </div>
      </footer>
    </main>
  );
}

export default function HomePage() {
  return (
    <MobileNavShell>
      <HomeContent />
    </MobileNavShell>
  );
}
