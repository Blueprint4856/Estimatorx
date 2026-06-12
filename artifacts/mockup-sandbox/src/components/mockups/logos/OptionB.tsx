export function OptionB() {
  return (
    <div className="min-h-screen bg-[#F0EDE8] flex flex-col items-center justify-center gap-16 p-10">
      <p className="text-xs font-mono text-[#999] uppercase tracking-widest -mb-10">Option B — Icon Badge + Stacked Name</p>

      {/* White background (navbar context) */}
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-sm border border-black/8 px-8 py-5 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 56" height="46">
          {/* Orange square icon */}
          <rect width="48" height="48" x="0" y="4" rx="6" fill="#E85D26"/>
          {/* Bold white X in icon */}
          <text x="5" y="41" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="38" fontWeight="900" fill="white" letterSpacing="-2">X</text>
          {/* "EstimatorX" main name */}
          <text x="60" y="30" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="20" fontWeight="900" fill="#1A1A1A" letterSpacing="-0.5">ESTIMATOR<tspan fill="#E85D26">X</tspan></text>
          {/* ".pro" as an orange pill beneath */}
          <rect x="60" y="36" width="36" height="14" rx="3" fill="#E85D26"/>
          <text x="63" y="47" fontFamily="Arial, Helvetica, sans-serif" fontSize="10" fontWeight="700" fill="white" letterSpacing="1">.PRO</text>
        </svg>
      </div>

      {/* Dark background */}
      <div className="w-full max-w-2xl bg-[#1A1A1A] rounded-xl px-8 py-5 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 56" height="46">
          <rect width="48" height="48" x="0" y="4" rx="6" fill="#E85D26"/>
          <text x="5" y="41" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="38" fontWeight="900" fill="white" letterSpacing="-2">X</text>
          <text x="60" y="30" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="20" fontWeight="900" fill="#F7F4F0" letterSpacing="-0.5">ESTIMATOR<tspan fill="#E85D26">X</tspan></text>
          <rect x="60" y="36" width="36" height="14" rx="3" fill="#E85D26"/>
          <text x="63" y="47" fontFamily="Arial, Helvetica, sans-serif" fontSize="10" fontWeight="700" fill="white" letterSpacing="1">.PRO</text>
        </svg>
      </div>

      {/* Small */}
      <div className="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 56" height="28">
          <rect width="48" height="48" x="0" y="4" rx="6" fill="#E85D26"/>
          <text x="5" y="41" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="38" fontWeight="900" fill="white" letterSpacing="-2">X</text>
          <text x="60" y="30" fontFamily="'Arial Black', 'Helvetica Neue', sans-serif" fontSize="20" fontWeight="900" fill="#1A1A1A" letterSpacing="-0.5">ESTIMATOR<tspan fill="#E85D26">X</tspan></text>
          <rect x="60" y="36" width="36" height="14" rx="3" fill="#E85D26"/>
          <text x="63" y="47" fontFamily="Arial, Helvetica, sans-serif" fontSize="10" fontWeight="700" fill="white" letterSpacing="1">.PRO</text>
        </svg>
        <span className="text-xs text-[#999]">at 28px</span>
      </div>
    </div>
  );
}
