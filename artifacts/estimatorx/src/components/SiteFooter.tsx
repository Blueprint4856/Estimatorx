import { Link } from "wouter";

export default function SiteFooter() {
  return (
    <footer className="bg-[#2C2825] py-10 border-t border-black/20">
      <div className="container mx-auto px-4 flex flex-col items-center gap-4">
        <Link href="/" aria-label="EstimatorX.pro home">
          <img src="/logo.png" alt="EstimatorX.pro" className="h-12 object-contain brightness-0 invert opacity-70 hover:opacity-100 transition-opacity" />
        </Link>
        <div className="flex items-center gap-6 flex-wrap justify-center text-sm text-[#A09890]">
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <span className="text-[#4A4540]">·</span>
          <Link href="/terms" className="hover:text-white transition-colors">Terms of Use</Link>
        </div>
        <p className="text-[#6B6460] text-xs">&copy; {new Date().getFullYear()} EstimatorX.pro. All rights reserved.</p>
      </div>
    </footer>
  );
}
