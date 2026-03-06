import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import { useUnread } from "../context/UnreadContext";

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

export default function Conversations() {
  const navigate = useNavigate();
  const { unreadCount } = useUnread();

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/messages/conversations`);
        if (!res.ok) throw new Error("Failed to load conversations");
        const data = await res.json();
        if (!cancelled) setConversations(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  function chatLink(c) {
    const base = `/chat/${c.other_user_id}`;
    return c.product_id ? `${base}?product=${c.product_id}` : base;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Messages</h1>
            <p className="mt-1 text-sm text-gray-500">
              {unreadCount > 0
                ? `${unreadCount} unread message${unreadCount > 1 ? "s" : ""}`
                : "All caught up"}
            </p>
          </div>
          <button
            onClick={() => navigate("/home")}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Back to Home
          </button>
        </div>

        {/* List */}
        {loading && (
          <p className="py-12 text-center text-gray-400">Loading...</p>
        )}

        {error && (
          <p className="py-12 text-center text-red-500">{error}</p>
        )}

        {!loading && !error && conversations.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="text-gray-400">No conversations yet.</p>
            <Link
              to="/home"
              className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
            >
              Browse products to start chatting
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {conversations.map((c) => {
            const productImg = resolveMediaUrl(c.product_image);
            return (
              <Link
                key={c.other_user_id}
                to={chatLink(c)}
                className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 transition hover:shadow-md"
              >
                {/* Product thumbnail or avatar fallback */}
                {productImg ? (
                  <img
                    src={productImg}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-600">
                    {c.other_username?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                )}

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-semibold text-gray-800">
                      {c.other_username}
                    </span>
                    <span className="ml-2 shrink-0 text-xs text-gray-400">
                      {new Date(c.last_time).toLocaleDateString()}
                    </span>
                  </div>

                  {c.product_title && (
                    <p className="truncate text-xs text-indigo-500">
                      Re: {c.product_title}
                    </p>
                  )}

                  <p className="mt-0.5 truncate text-sm text-gray-500">
                    {c.last_message}
                  </p>
                </div>

                {/* Unread badge */}
                {c.unread_count > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                    {c.unread_count > 99 ? "99+" : c.unread_count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
