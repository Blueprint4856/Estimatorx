export function OptionC() {
  return (
    <div className="min-h-screen bg-[#F0EDE8] flex flex-col items-center justify-center gap-16 p-10">
      <p className="text-xs font-mono text-[#999] uppercase tracking-widest -mb-10">Option C — Industrial / All-Caps</p>

      {/* White background */}
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-sm border border-black/8 px-8 py-5 flex items-center gap-4">
        {/* Angle-bracket construction mark */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 48" height="44">
          <polyline points="28,4 8,24 28,44" fill="none" stroke="#E85D26" strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter"/>
          <polyline points="38,4 18,24 38,44" fill="none" stroke="#1A1A1A" strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter"/>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56" height="44">
          {/* ESTIMATORX all caps, heavy */}
          <text x="0" y="34" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="28" fontWeight="900" fill="#1A1A1A" letterSpacing="1">ESTIMATOR<tspan fill="#E85D26">X</tspan></text>
          {/* Divider line */}
          <line x1="0" y1="40" x2="270" y2="40" stroke="#E85D26" strokeWidth="2"/>
          {/* .PRO tag right-aligned */}
          <text x="0" y="53" fontFamily="Arial, Helvetica, sans-serif" fontSize="11" fontWeight="700" fill="#888" letterSpacing="4">PROFESSIONAL ESTIMATING</text>
        </svg>
      </div>

      {/* Dark background */}
      <div className="w-full max-w-2xl bg-[#1A1A1A] rounded-xl px-8 py-5 flex items-center gap-4">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 48" height="44">
          <polyline points="28,4 8,24 28,44" fill="none" stroke="#E85D26" strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter"/>
          <polyline points="38,4 18,24 38,44" fill="none" stroke="#F7F4F0" strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter"/>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56" height="44">
          <text x="0" y="34" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="28" fontWeight="900" fill="#F7F4F0" letterSpacing="1">ESTIMATOR<tspan fill="#E85D26">X</tspan></text>
          <line x1="0" y1="40" x2="270" y2="40" stroke="#E85D26" strokeWidth="2"/>
          <text x="0" y="53" fontFamily="Arial, Helvetica, sans-serif" fontSize="11" fontWeight="700" fill="#666" letterSpacing="4">PROFESSIONAL ESTIMATING</text>
        </svg>
      </div>

      {/* Small */}
      <div className="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 48" height="28">
          <polyline points="28,4 8,24 28,44" fill="none" stroke="#E85D26" strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter"/>
          <polyline points="38,4 18,24 38,44" fill="none" stroke="#1A1A1A" strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter"/>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56" height="28">
          <text x="0" y="34" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="28" fontWeight="900" fill="#1A1A1A" letterSpacing="1">ESTIMATOR<tspan fill="#E85D26">X</tspan></text>
          <line x1="0" y1="40" x2="270" y2="40" stroke="#E85D26" strokeWidth="2"/>
          <text x="0" y="53" fontFamily="Arial, Helvetica, sans-serif" fontSize="11" fontWeight="700" fill="#888" letterSpacing="4">PROFESSIONAL ESTIMATING</text>
        </svg>
        <span className="text-xs text-[#999]">at 28px</span>
      </div>
    </div>
  );
}
