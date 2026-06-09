import SiteFooter from "@/components/SiteFooter";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-[#1A1A1A] flex flex-col">

      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <a href="/" aria-label="EstimatorX.pro home">
          <img src="/logo.svg" alt="EstimatorX.pro" className="h-12 mx-auto mb-10 opacity-80 hover:opacity-100 transition-opacity" />
        </a>

        <div className="text-[#E85D26] text-7xl font-black mb-4 leading-none">404</div>

        <h1 className="text-[#F7F4F0] font-black text-2xl md:text-3xl uppercase tracking-tight mb-4">
          Page Not Found
        </h1>

        <p className="text-[#888] text-sm max-w-sm mb-3 leading-relaxed">
          The page you're looking for doesn't exist. But while you're here — do you know what your next construction project will cost?
        </p>

        <p className="text-[#555] text-xs mb-10 max-w-xs leading-relaxed">
          EstimatorX.pro gives you accurate residential construction cost estimates using field-proven formulas and RSMeans labor rates — free to start, no contractor required.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href="/sign-up"
            className="inline-block bg-[#E85D26] text-white px-8 py-3.5 font-bold uppercase tracking-widest text-sm hover:bg-[#D44A15] transition-colors"
          >
            Start Your Free Estimate
          </a>
          <a
            href="/"
            className="inline-block border border-[#3A3530] text-[#A8A09A] px-8 py-3.5 font-bold uppercase tracking-widest text-sm hover:border-[#E85D26] hover:text-[#F7F4F0] transition-colors"
          >
            Back to Home
          </a>
        </div>
      </div>

      <SiteFooter />

    </div>
  );
}
