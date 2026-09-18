// Fallback borough data (6 of 33), used only if predictions.json is ever
// missing a code the engine asks for. Written as a stopgap early in the build
// so character generation didn't have to wait on the model export; the real
// predictions.json now covers all 33 boroughs and is authoritative.

export interface BoroughInfo {
  code: string;
  name: string;
  avgPrice: number;
  avgRent: number;
}

export const BOROUGHS: BoroughInfo[] = [
  { code: "E09000031", name: "Waltham Forest", avgPrice: 512000, avgRent: 1480 },
  { code: "E09000012", name: "Hackney", avgPrice: 638000, avgRent: 1950 },
  { code: "E09000025", name: "Newham", avgPrice: 421000, avgRent: 1520 },
  { code: "E09000002", name: "Barking & Dagenham", avgPrice: 348000, avgRent: 1310 },
  { code: "E09000008", name: "Croydon", avgPrice: 398000, avgRent: 1290 },
  { code: "E09000007", name: "Camden", avgPrice: 852000, avgRent: 2340 },
];

export const boroughByCode = (code: string): BoroughInfo | undefined =>
  BOROUGHS.find((b) => b.code === code);
