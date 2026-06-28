export function OptionA() {
  return (
    <div className="min-h-screen bg-[#F0EDE8] flex flex-col items-center justify-center gap-16 p-10">
      <p className="text-xs font-mono text-[#999] uppercase tracking-widest -mb-10">Option A — Inline Wordmark</p>

      {/* White background (navbar context) */}
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-sm border border-black/8 px-8 py-5 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 52" height="44">
          {/* "Estimator" — bold dark */}
          <text x="0" y="38" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="36" fontWeight="900" fill="#1A1A1A" letterSpacing="-1">Estimator</text>
          {/* "X" — orange, same weight */}
          <text x="222" y="38" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="36" fontWeight="900" fill="#E85D26" letterSpacing="-1">X</text>
          {/* ".pro" — lightweight, orange */}
          <text x="249" y="38" fontFamily="Arial, Helvetica, sans-serif" fontSize="22" fontWeight="400" fill="#E85D26" letterSpacing="0">.pro</text>
        </svg>
      </div>

      {/* Dark background (footer context) */}
      <div className="w-full max-w-2xl bg-[#1A1A1A] rounded-xl px-8 py-5 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 52" height="44">
          <text x="0" y="38" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="36" fontWeight="900" fill="#F7F4F0" letterSpacing="-1">Estimator</text>
          <text x="222" y="38" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="36" fontWeight="900" fill="#E85D26" letterSpacing="-1">X</text>
          <text x="249" y="38" fontFamily="Arial, Helvetica, sans-serif" fontSize="22" fontWeight="400" fill="#E85D26" letterSpacing="0">.pro</text>
        </svg>
      </div>

      {/* Small favicon-scale mark */}
      <div className="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 52" height="24">
          <text x="0" y="38" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="36" fontWeight="900" fill="#1A1A1A" letterSpacing="-1">Estimator</text>
          <text x="222" y="38" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="36" fontWeight="900" fill="#E85D26" letterSpacing="-1">X</text>
          <text x="249" y="38" fontFamily="Arial, Helvetica, sans-serif" fontSize="22" fontWeight="400" fill="#E85D26" letterSpacing="0">.pro</text>
        </svg>
        <span className="text-xs text-[#999]">at 24px</span>
      </div>
    </div>
  );
}
