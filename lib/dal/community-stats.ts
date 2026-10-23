import "server-only";

import { unstable_cache } from "next/cache";
import { toCommunityStats, type CommunityStats } from "@/lib/community-stats";
import { createPublicClient } from "@/lib/supabase/public";

// The marketing layout reads cookies, so the page itself renders dynamically
// and `revalidate` on it is inert; the explicit data cache is what keeps this
// query off the database for five minutes. createPublicClient() never touches
// cookies(), so it is allowed inside the cache scope. Errors propagate: a
// database failure must not silently render as "no stats".
export const getCommunityStats: () => Promise<CommunityStats> = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("public_community_stats");
    if (error) throw error;
    return toCommunityStats(data?.[0]);
  },
  ["community-stats"],
  { revalidate: 300, tags: ["community-stats"] },
);
