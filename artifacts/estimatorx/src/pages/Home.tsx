import React, { useState } from "react";
import { motion } from "framer-motion";
import { Calculator, HardHat, Building, PenTool, CheckCircle2, ChevronRight, Menu, X, ArrowRight, Activity, Globe, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function Home() {
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setFormData({ name: "", email: "", message: "" });
      toast({
        title: "Inquiry Sent",
        description: "We'll be in touch shortly to discuss your estimating needs.",
      });
    }, 1000);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F7F4F0] text-[#1A1A1A]">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#E0DAD3] bg-white shadow-sm">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="EstimatorX.pro Logo" className="h-16 object-contain" />
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium tracking-wide">
            <a href="#expertise" className="text-[#444] hover:text-[#E85D26] transition-colors">EXPERTISE</a>
            <a href="#services" className="text-[#444] hover:text-[#E85D26] transition-colors">SERVICES</a>
            <a href="#experience" className="text-[#444] hover:text-[#E85D26] transition-colors">EXPERIENCE</a>
            <a href="#contact" className="bg-[#E85D26] text-white px-6 py-2.5 rounded-none hover:bg-[#D44A15] transition-colors font-bold uppercase tracking-wider">
              Request Estimate
            </a>
          </nav>

          <button className="md:hidden text-[#1A1A1A]" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-20 left-0 w-full bg-white border-b border-[#E0DAD3] py-4 px-4 flex flex-col gap-4 shadow-lg">
            <a href="#expertise" onClick={() => setIsMenuOpen(false)} className="text-lg font-medium text-[#444]">Expertise</a>
            <a href="#services" onClick={() => setIsMenuOpen(false)} className="text-lg font-medium text-[#444]">Services</a>
            <a href="#experience" onClick={() => setIsMenuOpen(false)} className="text-lg font-medium text-[#444]">Experience</a>
            <a href="#contact" onClick={() => setIsMenuOpen(false)} className="bg-[#E85D26] text-white px-6 py-3 text-center font-bold uppercase">Request Estimate</a>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-24 pb-32 md:pt-28 md:pb-44 overflow-hidden">
          {/* Residential background image */}
          <div className="absolute inset-0 z-0">
            <img
              src="/hero-residential.png"
              alt="Residential subdivision construction"
              className="w-full h-full object-cover"
            />
            {/* Warm light overlay — heavier on the left where text sits, lighter on right */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#FAF7F3]/95 via-[#FAF7F3]/80 to-[#FAF7F3]/30" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#F7F4F0]/60 via-transparent to-transparent" />
          </div>

          <div className="container relative z-10 mx-auto px-4">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="max-w-3xl"
            >
              <motion.div variants={fadeIn} className="flex items-center gap-3 mb-6">
                <div className="w-12 h-[2px] bg-[#E85D26]"></div>
                <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">Leslie Fogg • Sheridan, WY</span>
              </motion.div>
              <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl lg:text-8xl font-serif font-black leading-[1.05] mb-8 uppercase text-[#1A1A1A]">
                PRECISION<br />ESTIMATING.<br /><span className="text-[#E85D26]">ZERO FLUFF.</span>
              </motion.h1>
              <motion.p variants={fadeIn} className="text-xl md:text-2xl text-[#3A3530] max-w-xl mb-12 font-light leading-relaxed">
                38 years of ground-level residential construction experience. From spec homes to 24-lot subdivisions. The remote estimating partner you can trust to get the numbers right.
              </motion.p>
              <motion.div variants={fadeIn} className="flex flex-wrap gap-4">
                <a href="#contact" className="bg-[#E85D26] text-white px-8 py-4 font-bold text-lg hover:bg-[#D44A15] transition-all flex items-center gap-2 uppercase tracking-wide shadow-md">
                  Discuss Your Project <ArrowRight size={20} />
                </a>
                <a href="#expertise" className="border-2 border-[#1A1A1A] text-[#1A1A1A] px-8 py-4 font-bold text-lg hover:bg-[#1A1A1A] hover:text-white transition-all uppercase tracking-wide">
                  View Expertise
                </a>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="bg-[#E85D26] py-12 border-y border-[#C94A1A]">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-white/25">
              <div className="text-center px-4">
                <div className="text-4xl md:text-5xl font-black font-serif text-white mb-2">38+</div>
                <div className="text-white/90 font-medium uppercase tracking-wider text-sm">Years Experience</div>
              </div>
              <div className="text-center px-4">
                <div className="text-4xl md:text-5xl font-black font-serif text-white mb-2">24</div>
                <div className="text-white/90 font-medium uppercase tracking-wider text-sm">Active Lot Subdivision</div>
              </div>
              <div className="text-center px-4">
                <div className="text-4xl md:text-5xl font-black font-serif text-white mb-2">100%</div>
                <div className="text-white/90 font-medium uppercase tracking-wider text-sm">Remote Capable</div>
              </div>
              <div className="text-center px-4">
                <div className="text-4xl md:text-5xl font-black font-serif text-white mb-2">USA</div>
                <div className="text-white/90 font-medium uppercase tracking-wider text-sm">Nationwide Service</div>
              </div>
            </div>
          </div>
        </section>

        {/* Expertise Section */}
        <section id="expertise" className="py-24 bg-white text-[#1A1A1A]">
          <div className="container mx-auto px-4">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={fadeIn}
              className="mb-16 md:flex justify-between items-end"
            >
              <div className="max-w-2xl">
                <h2 className="text-4xl md:text-6xl font-black font-serif uppercase mb-6 text-[#1A1A1A]">Core <span className="text-[#E85D26]">Competencies</span></h2>
                <p className="text-xl text-gray-600">Deep command of construction financials and ground-level execution. Not just theoretical numbers — practical, buildable budgets.</p>
              </div>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: Calculator, title: "Cost Estimating", desc: "Precise residential cost estimating with detailed take-offs and quantity analysis." },
                { icon: Building, title: "Land Development", desc: "End-to-end subdivision & land development budgeting and forecasting." },
                { icon: Scale, title: "Financial Reconciliation", desc: "Rigorous financial tracking and audit-ready reporting for major projects." },
                { icon: HardHat, title: "Builder Coordination", desc: "Seamless coordination between builders, subcontractors, civil engineers, and vendors." },
                { icon: PenTool, title: "Permitting & Entitlements", desc: "Navigating complex municipal requirements and regulatory approvals." },
                { icon: Activity, title: "WOACE.co Software", desc: "Built proprietary construction accounting software — demonstrating deep technical finance knowledge." }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { delay: i * 0.1 } } }}
                  className="p-8 border-2 border-[#EAE5DF] hover:border-[#E85D26] transition-colors group bg-[#FAF8F5]"
                >
                  <item.icon size={40} className="text-[#E85D26] mb-6 group-hover:scale-110 transition-transform" />
                  <h3 className="text-2xl font-bold font-serif mb-4 uppercase">{item.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Experience Spotlight */}
        <section id="experience" className="py-24 bg-[#F0EDE8] border-t border-[#DDD8D0] relative overflow-hidden">
          <div className="absolute right-0 top-0 w-1/2 h-full hidden lg:block">
            <img src="/subdivision.png" alt="Subdivision aerial" className="w-full h-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#F0EDE8] via-[#F0EDE8]/70 to-transparent" />
          </div>

          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-[2px] bg-[#E85D26]"></div>
                <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">Current Project</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-black font-serif uppercase mb-8 text-[#1A1A1A]">Rosewood Lane<br/>Subdivision</h2>

              <div className="space-y-6 text-[#3A3530] text-lg">
                <p>Currently managing a 24-lot residential subdivision through every single phase of development.</p>

                <ul className="space-y-4">
                  {[
                    "Land Development & Grading",
                    "Permitting & Entitlements",
                    "Builder & Subcontractor Coordination",
                    "Lot Sales & Final Turnovers"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="text-[#E85D26] shrink-0 mt-1" />
                      <span className="font-medium text-[#1A1A1A]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-12 p-6 border-l-4 border-[#E85D26] bg-white shadow-sm">
                <h4 className="text-[#E85D26] font-bold uppercase tracking-wider text-sm mb-2">Corporate Leadership Background</h4>
                <p className="text-[#3A3530]">Former CEO of Unified Communications Corporation (2005–2015). Managed capital projects and infrastructure builds across a dozen+ US Data Center facilities — bringing corporate-grade financial rigor to residential construction estimating.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Services & Arrangements */}
        <section id="services" className="py-24 bg-white text-[#1A1A1A]">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-4xl md:text-5xl font-black font-serif uppercase mb-6">Flexible <span className="text-[#E85D26]">Arrangements</span></h2>
              <p className="text-xl text-gray-600">Operating out of Sheridan, WY, serving builders and developers nationwide. Available for remote work with travel as needed.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: "Per-Project", desc: "Fixed-fee estimating for specific residential builds or developments." },
                { title: "Part-Time", desc: "Dedicated weekly hours to supplement your in-house estimating team." },
                { title: "Fractional", desc: "Ongoing executive-level estimating and financial oversight." },
                { title: "Contract", desc: "Long-term arrangements for continuous residential project pipelines." }
              ].map((item, i) => (
                <div key={i} className="bg-[#FAF8F5] p-8 border-2 border-[#EAE5DF] hover:border-[#E85D26] hover:shadow-lg transition-all group">
                  <div className="w-10 h-1 bg-[#E85D26] mb-6" />
                  <h3 className="text-xl font-bold font-serif uppercase mb-4 text-[#1A1A1A]">{item.title}</h3>
                  <p className="text-gray-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA / Contact */}
        <section id="contact" className="py-24 relative overflow-hidden bg-[#F0EDE8] border-t border-[#DDD8D0]">
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl mx-auto bg-white p-8 md:p-12 border border-[#DDD8D0] shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-[2px] bg-[#E85D26]"></div>
                <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">Get in Touch</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black font-serif uppercase mb-2 text-[#1A1A1A]">Request an Estimate</h2>
              <p className="text-gray-500 mb-8">Send project details to discuss contract, fractional, or per-project estimating.</p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-wider text-[#555]">Name / Company</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors"
                      placeholder="John Doe Construction"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-wider text-[#555]">Email Address</label>
                    <input
                      required
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-[#555]">Project Details</label>
                  <textarea
                    required
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({...formData, message: e.target.value})}
                    className="w-full bg-[#FAF8F5] border border-[#DDD8D0] px-4 py-3 text-[#1A1A1A] focus:outline-none focus:border-[#E85D26] transition-colors resize-none"
                    placeholder="Briefly describe the scope, location, and timeline..."
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#E85D26] text-white py-4 font-bold uppercase tracking-widest hover:bg-[#D44A15] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                >
                  {isSubmitting ? "Sending..." : "Submit Inquiry"} <ChevronRight size={20} />
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#2C2825] py-12 border-t border-black/20">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="EstimatorX.pro Logo" className="h-12 object-contain brightness-0 invert opacity-70 hover:opacity-100 transition-all" />
          </div>
          <div className="text-[#A09890] text-sm flex items-center gap-6">
            <span>&copy; {new Date().getFullYear()} EstimatorX.pro. All rights reserved.</span>
            <span className="flex items-center gap-1"><Globe size={14}/> Nationwide / Remote</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
