import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { reportError } from "@/lib/errors";
import { PageSkeleton } from "@/components/loading";
import { RouteError } from "@/components/route-error";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Every failed query and save is reported to Lovable; pages show the error with a retry.
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (e, q) => reportError(e, { source: "query", key: JSON.stringify(q.queryKey).slice(0, 200) }) }),
    mutationCache: new MutationCache({ onError: (e) => reportError(e, { source: "mutation" }) }),
    defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPreload: "intent",
    defaultPendingComponent: () => <div className="p-4 sm:p-6 lg:p-8"><PageSkeleton /></div>,
    defaultPendingMs: 150,
    defaultErrorComponent: RouteError,
  });

  return router;
};
