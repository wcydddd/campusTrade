import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import UserCenterSidebar from "../components/UserCenterSidebar";

export default function MyReviews() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`${API_BASE}/reviews/me?limit=200`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setItems(Array.isArray(data.items) ? data.items : []);
        } else if (!cancelled) {
          setError(data.detail || data.message || "Failed to load reviews");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load reviews");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto flex gap-6 pt-6 px-4 pb-10">
        <UserCenterSidebar />

        {/* ---- Main Content ---- */}
        <section className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Top profile card */}
          <div className="relative bg-gradient-to-b from-gray-100 to-white px-6 pt-1 pb-5">
            <div className="h-1 w-full bg-gray-200 rounded-b-full absolute top-0 left-0 right-0" />

            <h1 className="text-lg font-extrabold text-gray-900 tracking-tight mt-5 mb-4">My Reviews</h1>

            <div className="flex items-start gap-5">
              {/* Avatar */}
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url.startsWith("http") ? user.avatar_url : `${API_BASE}${user.avatar_url}`}
                  alt={user.username || "avatar"}
                  className="w-20 h-20 rounded-full object-cover bg-gray-200 shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <svg className="w-9 h-9 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" />
                  </svg>
                </div>
              )}

              {/* User info */}
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-2xl font-bold text-gray-900 m-0 truncate">
                  {user?.username || "User"}
                </p>
                <p className="text-sm text-gray-400 mt-1 mb-0">
                  Excellent credit &middot; {items.length} review{items.length !== 1 ? "s" : ""} given
                </p>
              </div>

              {/* Back link */}
              <Link
                to="/home"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors no-underline shrink-0 mt-auto"
              >
                &larr; Back to Home
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="px-6 flex items-end gap-6 border-b border-gray-100">
            <button
              type="button"
              className="relative pb-3 text-sm font-bold text-gray-900 bg-transparent border-none cursor-pointer px-0 after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:bottom-0 after:w-8 after:h-[3px] after:rounded-full after:bg-amber-400"
            >
              All
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {loading && <p className="text-gray-400">Loading...</p>}
            {error && <p className="text-red-700">{error}</p>}

            {!loading && !error && items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24">
                <svg
                  className="w-16 h-16 text-gray-200 mb-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="1" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                  <line x1="9" y1="16" x2="13" y2="16" />
                </svg>
                <p className="text-sm text-gray-400 m-0">You haven't left any reviews yet.</p>
              </div>
            )}

            {!loading && !error && items.length > 0 && (
              <div className="flex flex-col gap-3">
                {items.map((r) => (
                  <div key={r.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between gap-3 items-baseline">
                      <div className="font-extrabold text-gray-900 text-sm">
                        To: {r.reviewee_username || "User"} &middot; {r.rating}/5
                      </div>
                      <div className="text-xs text-gray-400 shrink-0">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                      </div>
                    </div>
                    {r.comment ? (
                      <p className="mt-2 mb-0 text-sm text-gray-700 leading-relaxed">{r.comment}</p>
                    ) : (
                      <p className="mt-2 mb-0 text-sm text-gray-400 italic">No comment</p>
                    )}
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/my-orders?focus=${encodeURIComponent(r.order_id || "")}`)}
                        className="p-0 border-none bg-transparent text-indigo-600 cursor-pointer underline text-xs hover:text-indigo-800 transition-colors"
                        title="Go to this order"
                      >
                        Order: {String(r.order_id || "").slice(-8)}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

