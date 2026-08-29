export const gbp = (n: number) => {
  const v = Math.round(n);
  // A life can end underwater; "£-76,645" reads as a typo, "-£76,645" does not.
  return (v < 0 ? "-£" : "£") + Math.abs(v).toLocaleString("en-GB");
};

export const gbpK = (n: number) => {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000) return sign + "£" + (a / 1_000_000).toFixed(2) + "m";
  if (a >= 1_000) return sign + "£" + Math.round(a / 1_000) + "k";
  return gbp(n);
};

export const pct = (n: number, dp = 1) =>
  (n >= 0 ? "+" : "") + (n * 100).toFixed(dp) + "%";

export const pct0 = (n: number) => Math.round(n * 100) + "%";

/** Green above zero, red below. Used everywhere a growth figure appears. */
export const dirClass = (n: number) => (n >= 0 ? "up" : n < 0 ? "down" : "");
