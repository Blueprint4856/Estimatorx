import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  HardHat, Layers, FileText, BarChart2, Users, CheckCircle2,
  ChevronRight, Menu, X, ArrowRight, Globe, Zap, ShieldCheck,
  Wrench, Building2, Hammer, Plug, Wind, Droplets
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUser, useClerk } from "@clerk/react";
import { Link } from "wouter";
import SiteFooter from "@/components/SiteFooter";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export default function Home() {
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_key: "7dd5e3a9-8b16-4249-9e25-b3157759e919",
          subject: "EstimatorX.pro — Contact Form",
          name: formData.name,
          email: formData.email,
          message: formData.message,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setFormData({ name: "", email: "", message: "" });
        toast({ title: "Message Sent", description: "We'll get back to you shortly." });
      } else {
        toast({ title: "Something went wrong", description: "Please try again or email us directly." });
      }
    } catch {
      toast({ title: "Something went wrong", description: "Please check your connection and try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F7F4F0] text-[#1A1A1A]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 w-full border-b border-[#E0DAD3] bg-white shadow-sm">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              <img src="/logo.svg" alt="EstimatorX.pro Logo" className="h-16 object-contain" />
            </a>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium tracking-wide">
            <a href="#how-it-works" className="text-[#444] hover:text-[#E85D26] transition-colors">HOW IT WORKS</a>
            <a href="#trades" className="text-[#444] hover:text-[#E85D26] transition-colors">WHAT'S INSIDE</a>
            <a href="#for-pros" className="text-[#444] hover:text-[#E85D26] transition-colors">WHO IT'S FOR</a>
            {isLoaded && user ? (
              <>
                <Link href="/estimator" className="bg-[#E85D26] text-white px-6 py-2.5 hover:bg-[#D44A15] transition-colors font-bold uppercase tracking-wider">
                  Open Estimator
                </Link>
                <button onClick={() => signOut({ redirectUrl: "/" })} className="text-[#444] hover:text-[#E85D26] transition-colors">
                  SIGN OUT
                </button>
              </>
            ) : (
              <>
                <Link href="/sign-in" className="text-[#444] hover:text-[#E85D26] transition-colors">SIGN IN</Link>
                <Link href="/sign-up" className="bg-[#E85D26] text-white px-6 py-2.5 hover:bg-[#D44A15] transition-colors font-bold uppercase tracking-wider">
                  START FREE
                </Link>
              </>
            )}
          </nav>

          <button className="md:hidden text-[#1A1A1A]" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>

        {isMenuOpen && (
          <div className="md:hidden absolute top-20 left-0 w-full bg-white border-b border-[#E0DAD3] py-4 px-4 flex flex-col gap-4 shadow-lg">
            <a href="#how-it-works" onClick={() => setIsMenuOpen(false)} className="text-lg font-medium text-[#444]">How It Works</a>
            <a href="#trades" onClick={() => setIsMenuOpen(false)} className="text-lg font-medium text-[#444]">What's Inside</a>
            <a href="#for-pros" onClick={() => setIsMenuOpen(false)} className="text-lg font-medium text-[#444]">Who It's For</a>
            {isLoaded && user ? (
              <>
                <Link href="/estimator" onClick={() => setIsMenuOpen(false)} className="bg-[#E85D26] text-white px-6 py-3 text-center font-bold uppercase">Open Estimator</Link>
                <button onClick={() => { setIsMenuOpen(false); signOut({ redirectUrl: "/" }); }} className="text-lg font-medium text-[#444] text-left">Sign Out</button>
              </>
            ) : (
              <>
                <Link href="/sign-in" onClick={() => setIsMenuOpen(false)} className="text-lg font-medium text-[#444]">Sign In</Link>
                <Link href="/sign-up" onClick={() => setIsMenuOpen(false)} className="bg-[#E85D26] text-white px-6 py-3 text-center font-bold uppercase">Start Free</Link>
              </>
            )}
          </div>
        )}
      </header>

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="relative pt-24 pb-32 md:pt-28 md:pb-44 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <picture>
              <source
                type="image/webp"
                srcSet="/hero-residential-800.webp 800w, /hero-residential-1400.webp 1400w, /hero-residential.webp 1408w"
                sizes="100vw"
              />
              <img
                src="/hero-residential.png"
                alt="Residential subdivision construction"
                className="w-full h-full object-cover"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-r from-[#FAF7F3]/95 via-[#FAF7F3]/80 to-[#FAF7F3]/30" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#F7F4F0]/60 via-transparent to-transparent" />
          </div>

          <div className="container relative z-10 mx-auto px-4">
            <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-3xl">
              <motion.div variants={fadeIn} className="inline-flex items-center gap-2 bg-[#E85D26]/10 border border-[#E85D26]/30 px-4 py-2 mb-8">
                <span className="text-[#E85D26] font-bold uppercase tracking-widest text-xs">Free to Use — No Credit Card Required.</span>
              </motion.div>
              <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl lg:text-8xl font-serif font-black leading-[1.05] mb-4 uppercase text-[#1A1A1A]">
                Residential<br />Construction<br /><span className="text-[#E85D26]">Cost Estimator</span>
              </motion.h1>
              <motion.p variants={fadeIn} className="text-2xl md:text-3xl font-serif font-bold text-[#1A1A1A] mb-6 uppercase tracking-wide">
                Know what it costs before you build.
              </motion.p>
              <motion.p variants={fadeIn} className="text-xl md:text-2xl text-[#3A3530] max-w-xl mb-12 font-light leading-relaxed">
                Fast, honest construction estimates for anyone — homeowner, DIYer, or seasoned contractor. Built on 38 years of field knowledge so you don't have to be an expert to get real numbers.
              </motion.p>
              <motion.div variants={fadeIn} className="flex flex-wrap gap-4">
                <Link href="/sign-up" className="bg-[#E85D26] text-white px-8 py-4 font-bold text-lg hover:bg-[#D44A15] transition-all flex items-center gap-2 uppercase tracking-wide shadow-md">
                  Start Estimating Free <ArrowRight size={20} />
                </Link>
                <a href="#how-it-works" className="border-2 border-[#1A1A1A] text-[#1A1A1A] px-8 py-4 font-bold text-lg hover:bg-[#1A1A1A] hover:text-white transition-all uppercase tracking-wide">
                  See How It Works
                </a>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ── Stats Bar ── */}
        <section className="bg-[#E85D26] py-12 border-y border-[#C94A1A]">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-white/25">
              <div className="text-center px-4">
                <div className="text-4xl md:text-5xl font-black font-serif text-white mb-2">8</div>
                <div className="text-white/90 font-medium uppercase tracking-wider text-sm">Trade Categories</div>
              </div>
              <div className="text-center px-4">
                <div className="text-4xl md:text-5xl font-black font-serif text-white mb-2">38+</div>
                <div className="text-white/90 font-medium uppercase tracking-wider text-sm">Years Field Input</div>
              </div>
              <div className="text-center px-4">
                <div className="text-4xl md:text-5xl font-black font-serif text-white mb-2">RSM</div>
                <div className="text-white/90 font-medium uppercase tracking-wider text-sm">Labor Rates Built In</div>
              </div>
              <div className="text-center px-4">
                <div className="text-4xl md:text-5xl font-black font-serif text-white mb-2">ANY</div>
                <div className="text-white/90 font-medium uppercase tracking-wider text-sm">Project. Any Experience Level.</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section id="how-it-works" className="py-24 bg-white text-[#1A1A1A]">
          <div className="container mx-auto px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeIn} className="mb-16 max-w-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-[2px] bg-[#E85D26]" />
                <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">No Black Boxes</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-black font-serif uppercase mb-6">Real Numbers.<br /><span className="text-[#E85D26]">In Minutes.</span></h2>
              <p className="text-xl text-gray-600 leading-relaxed">You don't need to know what a "take-off" is to use EstimatorX. Enter what you know — square footage, room count, lot size — and the app does the estimating math, the same way a 38-year contractor would.</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  step: "01",
                  icon: FileText,
                  title: "Enter What You Know",
                  desc: "Square footage, number of rooms, lot size — plain inputs anyone can fill in. No construction jargon required. The app knows what to do with the numbers."
                },
                {
                  step: "02",
                  icon: BarChart2,
                  title: "Instant Material & Labor Breakdown",
                  desc: "Every line item auto-calculates from field-proven formulas and RSMeans national labor rates. You see exactly what materials you need and what labor should cost — no black box totals."
                },
                {
                  step: "03",
                  icon: FileText,
                  title: "Print, Share & Adjust",
                  desc: "Tweak quantities, adjust labor rates to your area, add custom line items, then print a clean report or share a live link with a contractor, lender, or partner."
                }
              ].map((item, i) => (
                <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }}
                  variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { delay: i * 0.15 } } }}
                  className="relative p-8 border-2 border-[#EAE5DF] hover:border-[#E85D26] transition-colors group bg-[#FAF8F5]">
                  <div className="text-6xl font-black font-serif text-[#EAE5DF] group-hover:text-[#E85D26]/20 transition-colors absolute top-6 right-6 leading-none">{item.step}</div>
                  <item.icon size={40} className="text-[#E85D26] mb-6" />
                  <h3 className="text-xl font-bold font-serif mb-4 uppercase">{item.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Built from the field ── */}
        <section className="py-24 bg-[#1A1A1A] text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 w-1/2 h-full hidden lg:block">
            <picture>
              <source type="image/webp" srcSet="/subdivision.webp" />
              <img src="/subdivision.png" alt="Subdivision aerial" className="w-full h-full object-cover opacity-20" loading="lazy" />
            </picture>
          </div>
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-[2px] bg-[#E85D26]" />
                <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">Why This Exists</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-black font-serif uppercase mb-8 text-white">
                Built Because<br/>Getting a Real Number<br/><span className="text-[#E85D26]">Shouldn't Require a Contractor.</span>
              </h2>
              <div className="space-y-5 text-gray-300 text-lg leading-relaxed">
                <p>After 38 years running residential projects — from single-lot custom homes to 24-lot subdivisions — I kept running into the same problem on both sides: homeowners who couldn't get a straight number without hiring someone, and contractors who spent hours on estimates that spreadsheets should handle in minutes.</p>
                <p>So we built EstimatorX from the ground up using real take-off methodology, real waste factors, and RSMeans data anchored to how work is actually bid and priced. You don't need to understand the formulas — you just enter what you know, and the app calculates the rest the way an experienced estimator would.</p>
              </div>
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-4">
                  <ShieldCheck size={24} className="text-[#E85D26] shrink-0" />
                  <span className="text-white font-medium">Field-proven formulas, not textbook theory</span>
                </div>
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-4">
                  <Zap size={24} className="text-[#E85D26] shrink-0" />
                  <span className="text-white font-medium">RSMeans labor rates, adjustable to your market</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trades / What's Inside ── */}
        <section id="trades" className="py-24 bg-[#F7F4F0]">
          <div className="container mx-auto px-4">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeIn} className="mb-16 text-center max-w-3xl mx-auto">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-[2px] bg-[#E85D26]" />
                <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">All 8 Trades. One Tool.</span>
                <div className="w-12 h-[2px] bg-[#E85D26]" />
              </div>
              <h2 className="text-4xl md:text-6xl font-black font-serif uppercase mb-6">Every Trade.<br/><span className="text-[#E85D26]">Every Line Item.</span></h2>
              <p className="text-xl text-gray-600">From clearing the lot to setting the condenser — EstimatorX covers the full residential build scope with trade-specific inputs and itemized output for each discipline.</p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Layers, label: "Site Work", desc: "Clearing, grading, excavation, utilities, driveway" },
                { icon: Building2, label: "Foundation", desc: "Slab, crawl space, full basement — concrete & forming" },
                { icon: Hammer, label: "Walls & Framing", desc: "Exterior walls, interior partitions, sheathing, insulation" },
                { icon: Layers, label: "Floor Systems", desc: "Joist sizing, subfloor, beam spans, post count" },
                { icon: Wrench, label: "Roof", desc: "Trusses or rafters, decking, underlayment, shingles or metal" },
                { icon: Droplets, label: "Plumbing", desc: "Supply & DWV rough-in, fixtures, water heater" },
                { icon: Plug, label: "Electrical", desc: "Service panel, circuits, outlets, lighting, appliances" },
                { icon: Wind, label: "HVAC", desc: "Equipment sizing, ductwork, linesets, thermostats" }
              ].map((trade, i) => (
                <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }}
                  variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { delay: i * 0.07 } } }}
                  className="bg-white border-2 border-[#EAE5DF] hover:border-[#E85D26] transition-all group p-6">
                  <trade.icon size={28} className="text-[#E85D26] mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="text-lg font-bold font-serif uppercase mb-2">{trade.label}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{trade.desc}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-12 grid md:grid-cols-3 gap-6">
              {[
                { icon: BarChart2, title: "Itemized Takeoffs", desc: "Every material quantity broken out line by line — board feet, cubic yards, linear feet, each count. No black-box totals." },
                { icon: Users, title: "Share with Your Team", desc: "Generate a shareable link so your foreman, partner, or client can view the same estimate in real time." },
                { icon: FileText, title: "PDF Plan Import", desc: "Upload a building plan PDF and let the app extract dimensions automatically — skip manual input on straightforward plans." }
              ].map((feat, i) => (
                <div key={i} className="flex gap-4 bg-white border border-[#EAE5DF] p-6">
                  <feat.icon size={28} className="text-[#E85D26] shrink-0 mt-1" />
                  <div>
                    <h4 className="font-bold uppercase text-sm mb-2 tracking-wide">{feat.title}</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── For Pros ── */}
        <section id="for-pros" className="py-24 bg-white text-[#1A1A1A]">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-[2px] bg-[#E85D26]" />
                <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">For Everyone With a Project</span>
                <div className="w-12 h-[2px] bg-[#E85D26]" />
              </div>
              <h2 className="text-4xl md:text-5xl font-black font-serif uppercase mb-6">Simple Enough<br/>for Anyone.<br/><span className="text-[#E85D26]">Accurate Enough for Pros.</span></h2>
              <p className="text-xl text-gray-600">Whether you've never swung a hammer or you've built a hundred houses, EstimatorX gives you the same field-grade numbers — fast, itemized, and ready to act on.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-16">
              <div className="bg-[#FAF8F5] border-2 border-[#EAE5DF] p-8">
                <div className="w-10 h-1 bg-[#E85D26] mb-6" />
                <h3 className="text-2xl font-bold font-serif uppercase mb-6">Built For</h3>
                <ul className="space-y-4">
                  {[
                    "Homeowners planning an addition, remodel, or new build",
                    "DIYers who want real numbers before starting a project",
                    "First-time builders figuring out what things actually cost",
                    "Real estate investors running feasibility on a flip or rental",
                    "General contractors who need fast, defensible bid numbers",
                    "Developers budgeting subdivision or multi-unit projects"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 size={18} className="text-[#E85D26] shrink-0 mt-0.5" />
                      <span className="text-[#3A3530]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-[#1A1A1A] p-8 text-white">
                <div className="w-10 h-1 bg-[#E85D26] mb-6" />
                <h3 className="text-2xl font-bold font-serif uppercase mb-6">What You Get</h3>
                <ul className="space-y-4">
                  {[
                    "Rough-to-detailed estimates in minutes, not days",
                    "Itemized material lists you can take to a supplier",
                    "Adjustable labor rates for your area and project type",
                    "Clean printable output to share with a contractor or lender",
                    "Multiple saved projects to compare scope or scenarios",
                    "Shareable estimate links — no account needed to view"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 size={18} className="text-[#E85D26] shrink-0 mt-0.5" />
                      <span className="text-gray-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Pricing */}
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-10">
                <h3 className="text-2xl md:text-3xl font-black font-serif uppercase mb-2">Simple Pricing</h3>
                <p className="text-gray-500">Start free — no credit card, no commitment. Upgrade when you need more.</p>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="border-2 border-[#EAE5DF] bg-[#FAF8F5] p-8">
                  <div className="text-sm font-bold uppercase tracking-widest text-[#888] mb-2">Free</div>
                  <div className="text-4xl font-black font-serif mb-1">$0</div>
                  <div className="text-gray-500 text-sm mb-6">Always free — no credit card</div>
                  <ul className="space-y-3 mb-8">
                    {["All 8 trade estimators", "RSMeans labor rates included", "1 saved project", "Print for $0.99 per estimate"].map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-[#3A3530]">
                        <CheckCircle2 size={16} className="text-[#E85D26]" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/sign-up" className="block w-full text-center border-2 border-[#1A1A1A] text-[#1A1A1A] py-3 font-bold uppercase tracking-wide hover:bg-[#1A1A1A] hover:text-white transition-all">
                    Get Started Free
                  </Link>
                </div>
                <div className="border-2 border-[#E85D26] bg-white p-8 relative">
                  <div className="absolute -top-3 right-6 bg-[#E85D26] text-white text-xs font-bold uppercase tracking-widest px-3 py-1">Most Popular</div>
                  <div className="text-sm font-bold uppercase tracking-widest text-[#E85D26] mb-2">X Plan</div>
                  <div className="text-4xl font-black font-serif mb-1">$9.99<span className="text-lg font-normal text-gray-500">/mo</span></div>
                  <div className="text-gray-500 text-sm mb-6">For active estimators and frequent builders</div>
                  <ul className="space-y-3 mb-8">
                    {[
                      "Everything in Free",
                      "Unlimited saved projects",
                      "PDF building plan import",
                      "Live shareable estimate links",
                      "No watermarks on print output",
                      "Priority support"
                    ].map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-[#3A3530]">
                        <CheckCircle2 size={16} className="text-[#E85D26]" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/sign-up" className="block w-full text-center bg-[#E85D26] text-white py-3 font-bold uppercase tracking-wide hover:bg-[#D44A15] transition-all">
                    Start X Plan
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Contact ── */}
        <section id="contact" className="py-24 relative overflow-hidden bg-[#F0EDE8] border-t border-[#DDD8D0]">
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl mx-auto bg-white p-8 md:p-12 border border-[#DDD8D0] shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-[2px] bg-[#E85D26]" />
                <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">Get in Touch</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black font-serif uppercase mb-2 text-[#1A1A1A]">Questions or Feedback?</h2>
              <p className="text-gray-500 mb-8">Found something that doesn't match real-world pricing in your area? Want a trade or project type we haven't covered? Have a question before you sign up? We want to hear from you.</p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-wider text-[#555]">Name / Company</label>
                    <input required type="text" value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors"
                      placeholder="John Doe Construction" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-wider text-[#555]">Email Address</label>
                    <input required type="email" value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors"
                      placeholder="john@example.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-[#555]">Message</label>
                  <textarea required rows={4} value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                    className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors resize-none"
                    placeholder="Tell us what you're working on or what you'd like to see improved..." />
                </div>
                <button type="submit" disabled={isSubmitting}
                  className="w-full bg-[#E85D26] text-white py-4 font-bold uppercase tracking-widest hover:bg-[#D44A15] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md">
                  {isSubmitting ? "Sending..." : "Send Message"} <ChevronRight size={20} />
                </button>
              </form>
            </div>
          </div>
        </section>

      </main>

      <SiteFooter />

    </div>
  );
}
