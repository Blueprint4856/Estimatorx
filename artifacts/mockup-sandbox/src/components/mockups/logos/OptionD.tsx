export function OptionD() {
  return (
    <div className="min-h-screen bg-[#F0EDE8] flex flex-col items-center justify-center gap-16 p-10">
      <p className="text-xs font-mono text-[#999] uppercase tracking-widest -mb-10">Option D — Geometric X Mark</p>

      {/* White background */}
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-sm border border-black/8 px-8 py-5 flex items-center gap-4">
        {/* Geometric X mark: two thick crossing bars, one orange one dark */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52" height="46">
          {/* Orange bar: top-left to bottom-right */}
          <line x1="6" y1="6" x2="46" y2="46" stroke="#E85D26" strokeWidth="13" strokeLinecap="round"/>
          {/* Dark bar: top-right to bottom-left */}
          <line x1="46" y1="6" x2="6" y2="46" stroke="#1A1A1A" strokeWidth="13" strokeLinecap="round"/>
        </svg>
        {/* Text: EstimatorX.pro */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 52" height="46">
          <text x="0" y="30" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="22" fontWeight="900" fill="#1A1A1A" letterSpacing="-0.5">Estimator<tspan fill="#E85D26">X</tspan></text>
          <text x="0" y="48" fontFamily="Arial, Helvetica, sans-serif" fontSize="14" fontWeight="400" fill="#888077" letterSpacing="2">.PRO</text>
        </svg>
      </div>

      {/* Dark background */}
      <div className="w-full max-w-2xl bg-[#1A1A1A] rounded-xl px-8 py-5 flex items-center gap-4">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52" height="46">
          <line x1="6" y1="6" x2="46" y2="46" stroke="#E85D26" strokeWidth="13" strokeLinecap="round"/>
          <line x1="46" y1="6" x2="6" y2="46" stroke="#F7F4F0" strokeWidth="13" strokeLinecap="round"/>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 52" height="46">
          <text x="0" y="30" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="22" fontWeight="900" fill="#F7F4F0" letterSpacing="-0.5">Estimator<tspan fill="#E85D26">X</tspan></text>
          <text x="0" y="48" fontFamily="Arial, Helvetica, sans-serif" fontSize="14" fontWeight="400" fill="#888077" letterSpacing="2">.PRO</text>
        </svg>
      </div>

      {/* Small */}
      <div className="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52" height="28">
          <line x1="6" y1="6" x2="46" y2="46" stroke="#E85D26" strokeWidth="13" strokeLinecap="round"/>
          <line x1="46" y1="6" x2="6" y2="46" stroke="#1A1A1A" strokeWidth="13" strokeLinecap="round"/>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 52" height="28">
          <text x="0" y="30" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="22" fontWeight="900" fill="#1A1A1A" letterSpacing="-0.5">Estimator<tspan fill="#E85D26">X</tspan></text>
          <text x="0" y="48" fontFamily="Arial, Helvetica, sans-serif" fontSize="14" fontWeight="400" fill="#888077" letterSpacing="2">.PRO</text>
        </svg>
        <span className="text-xs text-[#999]">at 28px</span>
      </div>
    </div>
  );
}
