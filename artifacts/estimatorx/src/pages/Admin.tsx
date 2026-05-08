import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/react";
import { Redirect } from "wouter";

interface UserRow {
  id: string;
  email: string;
  createdAt: number;
  lastSignInAt: number | null;
}

interface AdminData {
  total: number;
  users: UserRow[];
}

const ADMIN_EMAIL = "lwfogg@renewal1.co";

function fmt(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fmtTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function Admin() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.primaryEmailAddress?.emailAddress === ADMIN_EMAIL;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !isAdmin) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${import.meta.env.BASE_URL}api/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`${res.status}`);
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        setLoading(false);
      }
    })();
  }, [isLoaded, isSignedIn, isAdmin, getToken]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
        <p className="text-[#A8A09A] text-sm uppercase tracking-widest">Access denied</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-8 h-8 bg-[#E85D26] flex items-center justify-center">
            <span className="text-white font-black text-sm">X</span>
          </div>
          <div>
            <h1 className="text-[#F7F4F0] font-black text-xl uppercase tracking-tight">
              EstimatorX Admin
            </h1>
            <p className="text-[#6B6460] text-xs uppercase tracking-widest">User Directory</p>
          </div>
        </div>

        {loading && (
          <p className="text-[#A8A09A] text-sm">Loading users…</p>
        )}

        {error && (
          <p className="text-red-400 text-sm">Error: {error}</p>
        )}

        {data && (
          <>
            <div className="flex gap-6 mb-8">
              <div className="border border-[#3A3530] px-6 py-4">
                <p className="text-[#6B6460] text-xs uppercase tracking-widest mb-1">Total Users</p>
                <p className="text-[#F7F4F0] font-black text-3xl">{data.total}</p>
              </div>
              <div className="border border-[#3A3530] px-6 py-4">
                <p className="text-[#6B6460] text-xs uppercase tracking-widest mb-1">Showing</p>
                <p className="text-[#F7F4F0] font-black text-3xl">{data.users.length}</p>
              </div>
            </div>

            <div className="border border-[#3A3530] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#3A3530]">
                    <th className="text-left px-4 py-3 text-[#6B6460] text-xs uppercase tracking-widest font-semibold">Email</th>
                    <th className="text-left px-4 py-3 text-[#6B6460] text-xs uppercase tracking-widest font-semibold">Signed Up</th>
                    <th className="text-left px-4 py-3 text-[#6B6460] text-xs uppercase tracking-widest font-semibold">Last Sign-In</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u, i) => (
                    <tr key={u.id} className={`border-b border-[#2C2825] ${i % 2 === 0 ? "" : "bg-[#1E1C1A]"}`}>
                      <td className="px-4 py-3 text-[#F7F4F0] font-mono text-xs">{u.email || "—"}</td>
                      <td className="px-4 py-3 text-[#A8A09A] text-xs whitespace-nowrap">{fmt(u.createdAt)}</td>
                      <td className="px-4 py-3 text-[#A8A09A] text-xs whitespace-nowrap">{fmtTime(u.lastSignInAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
