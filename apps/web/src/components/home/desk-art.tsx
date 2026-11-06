/** Decorative desk diagrams (no data): perps = 4 fixed leverage rungs, options = payoff curves. */
export function PerpsArt() {
  const rungs = ["1×", "1.25×", "1.5×", "2×"];
  return (
    <svg viewBox="0 0 320 120" className="h-auto w-full" aria-hidden="true">
      <line x1="0" y1="110" x2="320" y2="110" stroke="#2a2926" />
      {rungs.map((r, i) => {
        const hgt = 24 + i * 22;
        const x = 22 + i * 76;
        return (
          <g key={r}>
            <rect x={x} y={110 - hgt} width="52" height={hgt} rx="3" fill={i === 3 ? "#f0c48e" : "#141416"} stroke={i === 3 ? "#f0c48e" : "#2a2926"} />
            <text x={x + 26} y={110 - hgt - 8} textAnchor="middle" fontSize="11" fontFamily="var(--font-ibm-plex-mono)" fill={i === 3 ? "#f0c48e" : "#9b978f"}>
              {r}
            </text>
          </g>
        );
      })}
      <line x1="0" y1="34" x2="320" y2="34" stroke="#f0c48e" strokeDasharray="3 4" opacity="0.5" />
      <text x="4" y="28" fontSize="10" fontFamily="var(--font-ibm-plex-mono)" fill="#f0c48e">
        HARD CAP
      </text>
    </svg>
  );
}

export function OptionsArt() {
  return (
    <svg viewBox="0 0 320 120" className="h-auto w-full" aria-hidden="true">
      <line x1="0" y1="80" x2="320" y2="80" stroke="#2a2926" />
      <line x1="160" y1="8" x2="160" y2="112" stroke="#2a2926" strokeDasharray="2 4" />
      <path d="M0 92 H160 L300 12" fill="none" stroke="#f0c48e" strokeWidth="2.2" />
      <path d="M20 12 L160 92 H320" fill="none" stroke="#0b0e12" strokeWidth="1.6" opacity="0.55" />
      <text x="304" y="26" textAnchor="end" fontSize="10" fontFamily="var(--font-ibm-plex-mono)" fill="#f0c48e">
        CALL
      </text>
      <text x="26" y="30" fontSize="10" fontFamily="var(--font-ibm-plex-mono)" fill="#9b978f">
        PUT
      </text>
      <text x="164" y="118" fontSize="10" fontFamily="var(--font-ibm-plex-mono)" fill="#6e6b65">
        strike
      </text>
    </svg>
  );
}
