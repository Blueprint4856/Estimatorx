import { useState } from "react";
import { Check, Copy, X, Users } from "lucide-react";

interface InviteModalProps {
  url: string;
  estimateName: string;
  onClose: () => void;
}

export function InviteModal({ url, estimateName, onClose }: InviteModalProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg bg-white border border-[#DDD8D0] shadow-xl">
        {/* Header */}
        <div className="bg-[#1A1A1A] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#E85D26]/20 border border-[#E85D26]/40 flex items-center justify-center">
              <Users size={16} className="text-[#E85D26]" />
            </div>
            <div>
              <h2 className="text-white font-black uppercase tracking-widest text-sm">Invite Team Members</h2>
              <p className="text-[#888] text-xs mt-0.5 truncate max-w-[260px]">{estimateName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          <p className="text-[#444] text-sm mb-1">
            Share this link with your team. Anyone with the link can view and edit this estimate — no account needed.
          </p>
          <p className="text-[#999] text-xs mb-5">
            Changes made by collaborators are automatically saved back to this shared estimate every few seconds.
          </p>

          <label className="block text-[10px] font-bold uppercase tracking-widest text-[#888] mb-2">
            Invite Link
          </label>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              onClick={e => (e.target as HTMLInputElement).select()}
              className="flex-1 bg-[#F7F4F0] border border-[#DDD8D0] px-3 py-2.5 text-sm text-[#1A1A1A] font-mono focus:outline-none focus:border-[#E85D26] transition-colors"
            />
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-4 py-2.5 font-bold uppercase tracking-wider text-xs transition-colors whitespace-nowrap ${
                copied
                  ? "bg-green-600 text-white"
                  : "bg-[#E85D26] text-white hover:bg-[#D44A15]"
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>

          <div className="mt-5 p-3 bg-[#FFF8F5] border border-[#F0D8CC] text-xs text-[#8B4513] leading-relaxed">
            <strong>Note:</strong> This link stays active for this project. Your changes sync to collaborators automatically every few seconds — they just need to refresh to see the latest.
          </div>
        </div>

        <div className="px-6 pb-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold uppercase tracking-wider text-[#888] border border-[#DDD8D0] hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
