// Presentation flavour owned by [C]. D's copy.ts covers the event headlines,
// scenario lines and careers; these are the extra voices C puts on screen so
// the model is one source in a noisy market rather than an oracle (spec 21).
// If D wants them, move them into content/copy.ts and re-export from wiring.

export const NOISE: Record<string, { source: string; line: string }[]> = {
  rent_increase: [
    { source: "News",        line: "“London rents post another record quarter.”" },
    { source: "Your friend", line: "“Just pay it. Moving costs more than you think.”" },
    { source: "Your mum",    line: "“Are you sure you can’t buy? Renting is dead money.”" },
  ],
  buy_opportunity: [
    { source: "Estate agent", line: "“Properties like this don’t stay available for long.”" },
    { source: "News",         line: "“London property recovery around the corner?”" },
    { source: "Your mum",     line: "“I’d wait until rates come down.”" },
    { source: "Your friend",  line: "“Prices have already fallen. Surely they’ll bounce.”" },
  ],
  landlord_sells: [
    { source: "Your landlord", line: "“Nothing personal. The mortgage on it doesn’t work any more.”" },
    { source: "News",          line: "“Buy-to-let sell-offs hit a record as landlords quit the market.”" },
    { source: "Your friend",   line: "“Two months is nothing. Start looking tonight.”" },
    { source: "Your mum",      line: "“This is what I mean about renting.”" },
  ],
  rate_change: [
    { source: "News",        line: "“Bank holds rates as inflation proves stubborn.”" },
    { source: "Your friend", line: "“Everyone I know is fixing for five years.”" },
  ],
  household: [
    { source: "Your partner", line: "“We’d save a fortune. And I’d like to, obviously.”" },
  ],
  employment: [
    { source: "Recruiter", line: "“This is well above market for your level.”" },
  ],
  mortgage_reset: [
    { source: "News",        line: "“Thousands roll off cheap fixes this year.”" },
    { source: "Your friend", line: "“A lodger covers most of the increase, honestly.”" },
  ],
};

export const NPC_LINE: Record<string, string> = {
  landlord:     "“Sorry to knock unannounced. It’s about the tenancy.”",
  estate_agent: "“I think you’ll like this one. Shall we talk numbers?”",
  bank:         "“We’ve written to you about your mortgage.”",
  partner:      "“So… I’ve been thinking about the lease.”",
  employer:     "“Got a minute? There’s an opening I want you for.”",
};

export const NPC_NAME: Record<string, string> = {
  landlord: "Landlord", estate_agent: "Estate agent",
  bank: "Bank adviser", partner: "Partner", employer: "Employer",
};
