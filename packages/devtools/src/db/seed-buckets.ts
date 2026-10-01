import {
  seedBuckets,
  type BucketsConnection,
} from "@devdogsuga/cli-core/db/run";

export async function runSeedBuckets(conn: BucketsConnection): Promise<number> {
  return seedBuckets(conn);
}
