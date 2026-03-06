import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { useWs } from "../context/WebSocketContext";

const ICON_LABELS = {
  new_order: "New message",
  new_favorite: "New favorite",
  price_drop: "Price drop",
  system: "System",
};

const ICON_EMOJI = {
  new_order: "\u{1F4E8}",
  new_favorite: "\u2764\uFE0F",
  price_drop: "\u{1F4B0}",
  system: "\u{1F514}",
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { lastMessage } = useWs();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  // ── Fetch unread count and notification list on mount (keep history so list is not empty after return) ──
  useEffect(() => {
    if (!isAuthenticated) {
      setUnread(0);
      setItems([]);
      return;
    }
    let c = false;
    (async () => {
      try {
        const [countRes, listRes] = await Promise.all([
          authFetch(`${API_BASE}/notifications/unread-count`),
          authFetch(`${API_BASE}/notifications?limit=50`),
        ]);
        if (!c && countRes.ok) {
          const d = await countRes.json();
          setUnread(d.unread_count ?? 0);
        }
        if (!c && listRes.ok) {
          const data = await listRes.json();
          setItems(Array.isArray(data) ? data : []);
        }
      } catch { /* ignore */ }
    })();
    return () => { c = true; };
  }, [isAuthenticated]);

  // ── 同步：在 Messages 里查看某对话后，通知角标随之更新（来自 Chat 页的 notifications:unread_update） ──
  useEffect(() => {
    const handler = (e) => {
      if (typeof e.detail?.total_unread === "number") setUnread(e.detail.total_unread);
    };
    window.addEventListener("notifications:unread_update", handler);
    return () => window.removeEventListener("notifications:unread_update", handler);
  }, []);

  // ── Real-time push from WebSocket ──
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "notification") return;
    setUnread(lastMessage.notification_unread ?? ((p) => p + 1));
    setItems((prev) => {
      const n = lastMessage.notification;
      return [
        {
          id: n.id,
          type: n.ntype,
          title: n.title,
          body: n.body,
          link: n.link,
          read: false,
          created_at: n.created_at,
        },
        ...prev,
      ].slice(0, 50);
    });
  }, [lastMessage]);

  // ── Fetch list when panel opens (all notifications, read + unread, so history is kept) ──
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API_BASE}/notifications?limit=50`);
      if (r.ok) {
        const data = await r.json();
        setItems(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchList();
  };

  // ── Click outside to close ──
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Click an item: mark read + navigate ──
  const handleClick = async (item) => {
    setOpen(false);
    if (!item.read) {
      try {
        const r = await authFetch(`${API_BASE}/notifications/${item.id}/read`, { method: "POST" });
        if (r.ok) {
          const d = await r.json();
          setUnread(d.total_unread ?? Math.max(0, unread - 1));
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
        }
      } catch { /* ignore */ }
    }
    if (item.link) navigate(item.link);
  };

  // ── Mark all read ──
  const handleReadAll = async (e) => {
    e.stopPropagation();
    try {
      const r = await authFetch(`${API_BASE}/notifications/read-all`, { method: "POST" });
      if (r.ok) {
        setUnread(0);
        setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      }
    } catch { /* ignore */ }
  };

  if (!isAuthenticated) return null;

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      {/* ── Bell button ── */}
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        title={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "10px 16px",
          borderRadius: 12,
          border: "none",
          background: "#0f172a",
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#1e293b")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#0f172a")}
      >
        {/* Bell SVG */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span>Notifications</span>
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -8,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 9,
              background: "#ef4444",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              lineHeight: "18px",
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
            zIndex: 200,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px 10px",
              borderBottom: "1px solid #f1f5f9",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={handleReadAll}
                style={{
                  border: "none",
                  background: "none",
                  color: "#6366f1",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Items */}
          {loading && (
            <p style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Loading...
            </p>
          )}

          {!loading && items.length === 0 && (
            <p style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              No notifications yet.
            </p>
          )}

          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => handleClick(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && handleClick(item)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "12px 16px",
                cursor: "pointer",
                background: item.read ? "transparent" : "#f0f4ff",
                borderBottom: "1px solid #f8fafc",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { if (item.read) e.currentTarget.style.background = "#f8fafc"; }}
              onMouseLeave={(e) => { if (item.read) e.currentTarget.style.background = "transparent"; }}
            >
              {/* Icon */}
              <span style={{ fontSize: 18, lineHeight: "22px", flexShrink: 0 }}>
                {ICON_EMOJI[item.type] || "\u{1F514}"}
              </span>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: item.read ? 500 : 700,
                      color: "#0f172a",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.title || ICON_LABELS[item.type] || "Notification"}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>
                    {formatTime(item.created_at)}
                  </span>
                </div>
                <p
                  style={{
                    margin: "3px 0 0",
                    fontSize: 12,
                    color: "#64748b",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.body}
                </p>
              </div>

              {/* Unread dot */}
              {!item.read && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: "#6366f1",
                    flexShrink: 0,
                    marginTop: 7,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}
