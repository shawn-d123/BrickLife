// LimeZu character sheets are 24 frames of 16x32: six per direction, in the
// order right, up, left, down. Verified against the sheets, not assumed.
const DIR: Record<Facing, number> = { right: 0, up: 6, left: 12, down: 18 };

export type Facing = "right" | "up" | "left" | "down";
export type SheetName = "Adam" | "Alex" | "Amelia" | "Bob";

export const PLAYER_SHEETS: SheetName[] = ["Adam", "Amelia", "Alex"];

export const NPC_SHEET: Record<string, SheetName> = {
  landlord: "Bob",
  estate_agent: "Amelia",
  bank: "Alex",
  partner: "Adam",
  employer: "Bob",
};

/** Same skeleton, different clothes -- recolour rather than new art. */
export const NPC_HUE: Record<string, number> = {
  landlord: 0, estate_agent: 190, bank: 250, partner: 90, employer: 320,
};

export function Sprite({
  sheet, facing = "down", moving = false, x, y,
  hue = 0, style, className = "",
}: {
  sheet: SheetName;
  facing?: Facing;
  moving?: boolean;
  /** tile coordinates of the character's feet */
  x: number;
  y: number;
  hue?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  // Position is driven per frame by the walker, so there is deliberately no CSS
  // transition here. A transition would slide the sprite between waypoints
  // independently of the walk cycle, which is exactly the floating we removed.
  const file = moving ? "run" : "idle_anim";
  return (
    <>
      <div
        className="shadow"
        style={{
          left: `calc(${x + 0.12} * var(--tile) * var(--s) * 1px)`,
          top: `calc(${y + 0.86} * var(--tile) * var(--s) * 1px)`,
          width: `calc(0.76 * var(--tile) * var(--s) * 1px)`,
          height: `calc(0.22 * var(--tile) * var(--s) * 1px)`,
        }}
      />
      <div
        className={`sprite anim ${className}`}
        style={{
          backgroundImage: `url(/assets/sprites/characters/${sheet}_${file}_16x16.png)`,
          left: `calc(${x} * var(--tile) * var(--s) * 1px)`,
          top: `calc(${y - 1} * var(--tile) * var(--s) * 1px)`,
          ["--f0" as string]: DIR[facing],
          // Slower cadence than before: the walk should read as steps, not a glide.
          ["--dur" as string]: moving ? "0.72s" : "1.15s",
          filter: hue ? `hue-rotate(${hue}deg)` : undefined,
          ...style,
        }}
        aria-hidden
      />
    </>
  );
}
