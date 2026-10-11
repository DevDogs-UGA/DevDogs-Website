/** `.csv` files are bundled as text (wrangler.jsonc `rules`, and a plugin in vitest.config.ts). */
declare module "*.csv" {
  const text: string;
  export default text;
}
