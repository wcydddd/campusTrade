import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import { useUnread } from "../context/UnreadContext";
import NotificationBell from "../components/NotificationBell";
import { ChatPanel } from "./Chat";
import campusTradeLogo from "../assets/uol-secondhand-logo.png";

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

/** Format as: Today/Yesterday HH:mm, or M/D HH:mm, or YYYY/M/D */
function formatConversationTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (t.getTime() === today.getTime()) return `Today ${time}`;
  if (t.getTime() === yesterday.getTime()) return `Yesterday ${time}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

const MSG_CATEGORIES = [
  {
    key: "offers",
    label: "Offers",
    to: "/my-orders",
    bg: "bg-blue-50",
    color: "text-blue-500",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    key: "system",
    label: "System",
    to: "/conversations",
    bg: "bg-green-50",
    color: "text-green-600",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5L6 9H2v6h4l5 4V5z" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    ),
  },
  {
    key: "reviews",
    label: "Reviews",
    to: "/my-reviews",
    bg: "bg-pink-50",
    color: "text-pink-500",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    key: "favourites",
    label: "Favourites",
    to: "/my-favorites",
    bg: "bg-orange-50",
    color: "text-orange-500",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
];

export default function Conversations() {
  const navigate = useNavigate();
  const { unreadCount } = useUnread();

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeChat, setActiveChat] = useState(null);

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

  function handleSelectChat(c) {
    setActiveChat({ otherUserId: c.other_user_id, productId: c.product_id || null });
    setConversations((prev) =>
      prev.map((conv) =>
        conv.other_user_id === c.other_user_id && conv.product_id === c.product_id
          ? { ...conv, unread_count: 0 }
          : conv
      )
    );
  }

  function isActive(c) {
    return (
      activeChat?.otherUserId === c.other_user_id &&
      activeChat?.productId === (c.product_id || null)
    );
  }

  return (
    <div className="min-h-screen">
      {/* ── Yellow Header (single-row slim bar) ── */}
      <header className="bg-yellow-400 w-full shadow-md sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-6 py-2.5 flex items-center gap-5">
          <Link to="/home" className="flex items-center gap-2.5 shrink-0 no-underline">
            <img src={campusTradeLogo} alt="CampusTrade" className="h-11 w-11 rounded-xl object-contain" />
            <span className="text-[22px] font-extrabold text-gray-900 hidden sm:inline tracking-tight leading-none">CampusTrade</span>
          </Link>

          <Link
            to="/home"
            className="flex-1 flex items-center bg-white rounded-full px-4 py-2 max-w-xl no-underline shadow-sm border-2 border-transparent hover:border-yellow-500 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2.5 shrink-0">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="text-gray-400 text-sm">Search products...</span>
            <span className="ml-auto bg-yellow-400 text-gray-900 text-xs font-semibold rounded-full px-4 py-1">Search</span>
          </Link>

          <nav className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => navigate("/home")}
              className="p-2 rounded-lg text-gray-900 hover:bg-yellow-500/30 transition-colors border-0 bg-transparent cursor-pointer"
              title="Home"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </button>
            <div className="flex items-center shrink-0">
              <NotificationBell variant="utility" />
            </div>
            <Link to="/conversations" className="p-2 rounded-lg text-gray-900 hover:bg-yellow-500/30 transition-colors relative" title="Messages">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white border-2 border-yellow-400">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <Link to="/me" className="p-2 rounded-lg text-gray-900 hover:bg-yellow-500/30 transition-colors" title="Account">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Split-pane layout ── */}
      <div className="max-w-[1200px] mx-auto flex h-[calc(100vh-64px)] pt-4 pb-4 px-4 gap-4">

        {/* ── Left panel: conversation list ── */}
        <div className="w-80 shrink-0 bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
          {/* Title */}
          <div className="px-5 pt-5 pb-3 shrink-0">
            <h1 className="text-xl font-bold text-gray-900">Messages</h1>
            <p className="mt-1 text-sm text-gray-500">
              {unreadCount > 0
                ? `${unreadCount} unread message${unreadCount > 1 ? "s" : ""}`
                : "All caught up"}
            </p>
          </div>

          {/* Category shortcuts */}
          <div className="flex justify-around items-center py-3 mx-4 border-b border-gray-100 shrink-0">
            {MSG_CATEGORIES.map((cat) => (
              <Link
                key={cat.key}
                to={cat.to}
                className="flex flex-col items-center gap-1 no-underline group"
              >
                <div className={`relative w-10 h-10 rounded-xl ${cat.bg} flex items-center justify-center transition-transform group-hover:scale-105`}>
                  <span className={cat.color}>{cat.icon}</span>
                  {cat.key === "offers" && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full text-[10px] px-1 min-w-[16px] h-4 flex items-center justify-center font-bold leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-gray-500 font-medium group-hover:text-gray-900 transition-colors">
                  {cat.label}
                </span>
              </Link>
            ))}
          </div>

          {/* Scrollable conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <p className="py-12 text-center text-sm text-gray-400">Loading...</p>
            )}

            {error && (
              <p className="py-12 text-center text-sm text-red-500">{error}</p>
            )}

            {!loading && !error && conversations.length === 0 && (
              <div className="py-16 flex flex-col items-center justify-center text-center px-4">
                <svg
                  width="40" height="40" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
                  strokeLinejoin="round" className="text-gray-300 mb-2"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-gray-400 text-sm">No conversations</p>
                <Link
                  to="/home"
                  className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
                >
                  Browse products
                </Link>
              </div>
            )}

            {conversations.map((c) => {
              const active = isActive(c);
              return (
                <div
                  key={`${c.other_user_id}-${c.product_id ?? "none"}`}
                  onClick={() => handleSelectChat(c)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 ${
                    active ? "bg-yellow-50/70" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  {/* Avatar + unread badge */}
                  <div className="relative shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 to-orange-400 text-base font-bold text-white">
                      {c.other_username?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    {c.unread_count > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                        {c.unread_count > 99 ? "99+" : c.unread_count}
                      </span>
                    )}
                  </div>

                  {/* Name + message + time */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold text-gray-900">
                        {c.other_username}
                      </span>
                      <span className="shrink-0 text-xs text-gray-400">
                        {formatConversationTime(c.last_time)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-gray-500">
                      {c.product_title
                        ? `[${c.product_title}] ${c.last_message}`
                        : c.last_message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right panel: chat or empty state ── */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
          {activeChat ? (
            <ChatPanel
              key={`${activeChat.otherUserId}-${activeChat.productId || "none"}`}
              otherUserId={activeChat.otherUserId}
              productId={activeChat.productId}
              onBack={() => setActiveChat(null)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center">
              <svg
                width="64" height="64" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1" strokeLinecap="round"
                strokeLinejoin="round" className="text-yellow-300 mb-4"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-base font-medium text-gray-400">Select a conversation</p>
              <p className="text-sm text-gray-300 mt-1">Choose a contact to start chatting</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
