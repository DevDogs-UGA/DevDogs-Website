import { generateTypes } from "@devdogsuga/cli-core/db/run";

export async function runGenerateTypes(dbUrl: string): Promise<number> {
  return generateTypes(dbUrl);
}
