export function PremiseScene({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="screen center">
      <h1 className="survive">Survive</h1>

      <div className="survive-copy">
        <p>
          Four years. One income. A city that was never asked what you could afford.
        </p>
        <p>
          Every year something arrives at your door — a letter, a landlord,
          an offer with a deadline on it.
        </p>
        <p className="survive-sting">
          You will not find out which choice was the right one until 2030.
        </p>
      </div>

      <button className="primary" autoFocus onClick={onBegin}>Begin</button>
    </div>
  );
}
