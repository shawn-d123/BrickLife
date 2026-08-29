import { useState } from "react";
import { Sprite, PLAYER_SHEETS } from "../components/Sprite";

export function CharacterScene({
  onDone,
}: {
  onDone: (name: string, spriteId: 0 | 1 | 2) => void;
}) {
  const [name, setName] = useState("");
  const [spriteId, setSpriteId] = useState<0 | 1 | 2>(0);

  return (
    <div className="screen center">
      <h2>Who are you?</h2>
      <input
        type="text"
        value={name}
        maxLength={16}
        placeholder="Your name"
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onDone(name.trim(), spriteId); }}
      />

      <div className="pickrow" style={{ marginTop: 6 }}>
        {PLAYER_SHEETS.map((sheet, i) => (
          <div
            key={sheet}
            className={`pick ${spriteId === i ? "sel" : ""}`}
            onClick={() => setSpriteId(i as 0 | 1 | 2)}
            role="radio"
            aria-checked={spriteId === i}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSpriteId(i as 0 | 1 | 2); }}
          >
            <div
              style={{
                position: "relative", width: 64, height: 96,
                ["--s" as string]: 4, ["--tile" as string]: 16,
              }}
            >
              <Sprite sheet={sheet} x={0} y={1} />
            </div>
            <span className="name">{sheet}</span>
          </div>
        ))}
      </div>

      <p className="footnote" style={{ maxWidth: 460 }}>
        You choose how you look. You do not choose your salary, your savings, your borough
        or your family. Those are dealt to you.
      </p>

      <button
        className="primary"
        disabled={!name.trim()}
        onClick={() => onDone(name.trim(), spriteId)}
      >
        Deal me in
      </button>
    </div>
  );
}
