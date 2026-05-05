import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { useWs } from "../context/WebSocketContext";

const ICON_LABELS = {
  new_order: "New message",
  order_update: "Order update",
  new_favorite: "New favorite",
  price_drop: "Price drop",
  system: "System",
  product_review: "Listing update",
  product_takedown: "Listing taken down",
  product_restored: "Listing restored",
  admin_review: "Admin: review queue",
  admin_report: "Admin: report",
};

const ICON_EMOJI = {
  new_order: "\u{1F4E8}",
  order_update: "\u{1F4E6}",
  new_favorite: "\u2764\uFE0F",
  price_drop: "\u{1F4B0}",
  system: "\u{1F514}",
  product_review: "\u2705",
  product_takedown: "\u{1F6AB}",
  product_restored: "\u{1F504}",
  admin_review: "\u{1F4CB}",
  admin_report: "\u{1F6A8}",
};

/** Chat alerts use Messages badge only; exclude from bell count & list (legacy rows may still exist in DB). */
const BELL_EXCLUDE_TYPES = new Set(["new_order"]);

export default function NotificationBell({ variant = "default" }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { lastMessage } = useWs();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const bellBadgeCount = useMemo(
    () => items.filter((i) => !i.read && !BELL_EXCLUDE_TYPES.has(i.type)).length,
    [items],
  );

  const visibleItems = useMemo(
    () => items.filter((i) => !BELL_EXCLUDE_TYPES.has(i.type)),
    [items],
  );

  const refreshItems = useCallback(async () => {
    try {
      const listRes = await authFetch(`${API_BASE}/notifications?limit=50`);
      if (listRes.ok) {
        const data = await listRes.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }, []);

  // ── Fetch list on mount ──
  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      return;
    }
    let c = false;
    (async () => {
      try {
        const listRes = await authFetch(`${API_BASE}/notifications?limit=50`);
        if (!c && listRes.ok) {
          const data = await listRes.json();
          setItems(Array.isArray(data) ? data : []);
        }
      } catch { /* ignore */ }
    })();
    return () => { c = true; };
  }, [isAuthenticated]);

  // ── e.g. Chat read-by-link marks rows read — refresh list so bell count stays right ──
  useEffect(() => {
    const handler = () => {
      refreshItems();
    };
    window.addEventListener("notifications:unread_update", handler);
    return () => window.removeEventListener("notifications:unread_update", handler);
  }, [refreshItems]);

  // ── Real-time push from WebSocket (skip chat duplicates) ──
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "notification") return;
    const n = lastMessage.notification;
    if (!n || BELL_EXCLUDE_TYPES.has(n.ntype)) return;

    setItems((prev) =>
      [
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
      ].slice(0, 50),
    );
  }, [lastMessage]);

  // ── Fetch list when panel opens (all notifications, read + unread, so history is kept) ──
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API_BASE}/notifications?limit=50`);
      if (r.ok) {
        const data = await r.json();
        setItems(Array.isArray(data) ? data : []);
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
          if (typeof d.total_unread === "number") {
            window.dispatchEvent(new CustomEvent("notifications:unread_update", { detail: { total_unread: d.total_unread } }));
          }
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
        const d = await r.json().catch(() => ({}));
        window.dispatchEvent(new CustomEvent("notifications:unread_update", { detail: { total_unread: d.total_unread ?? 0 } }));
        setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      }
    } catch { /* ignore */ }
  };

  // ── Clear all notifications (delete server-side; avoid unread_update → refreshItems race that repopulated the list) ──
  const handleClearAll = async (e) => {
    e.stopPropagation();
    try {
      const r = await authFetch(`${API_BASE}/notifications/clear-all`, { method: "POST" });
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        setItems([]);
        window.dispatchEvent(new CustomEvent("notifications:unread_update", { detail: { total_unread: d.total_unread ?? 0 } }));
      }
    } catch { /* ignore */ }
  };

  if (!isAuthenticated) return null;

  const isNav = variant === "nav";
  const isUtility = variant === "utility";
  const buttonStyle = isUtility
    ? {
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "8px 12px",
        borderRadius: 8,
        border: "none",
        background: "transparent",
        color: "#1a1a1a",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.15s",
      }
    : isNav
    ? {
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        minHeight: 46,
        padding: "11px 16px",
        borderRadius: 14,
        border: "1px solid rgba(148, 163, 184, 0.18)",
        background: "#fff",
        color: "#0f172a",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.2s, box-shadow 0.2s, transform 0.15s, border-color 0.2s",
        boxShadow: "0 8px 18px rgba(15, 23, 42, 0.05)",
      }
    : {
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
      };

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      {/* ── Bell button ── */}
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        title={bellBadgeCount > 0 ? `Notifications (${bellBadgeCount} unread)` : "Notifications"}
        style={buttonStyle}
        onMouseEnter={(e) => {
          if (isUtility) {
            e.currentTarget.style.background = "rgba(0, 0, 0, 0.08)";
          } else if (isNav) {
            e.currentTarget.style.background = "#f8fafc";
            e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.22)";
            e.currentTarget.style.boxShadow = "0 14px 28px rgba(15, 23, 42, 0.08)";
            e.currentTarget.style.transform = "translateY(-1px)";
          } else {
            e.currentTarget.style.background = "#1e293b";
          }
        }}
        onMouseLeave={(e) => {
          if (isUtility) {
            e.currentTarget.style.background = "transparent";
          } else if (isNav) {
            e.currentTarget.style.background = "#fff";
            e.currentTarget.style.borderColor = "rgba(148, 163, 184, 0.18)";
            e.currentTarget.style.boxShadow = "0 8px 18px rgba(15, 23, 42, 0.05)";
            e.currentTarget.style.transform = "translateY(0)";
          } else {
            e.currentTarget.style.background = "#0f172a";
          }
        }}
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
        {bellBadgeCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 20,
              height: 20,
              padding: "0 6px",
              borderRadius: 999,
              background: "#ef4444",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              lineHeight: "20px",
              textAlign: "center",
              pointerEvents: "none",
              border: "2px solid #fff",
            }}
          >
            {bellBadgeCount > 99 ? "99+" : bellBadgeCount}
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {bellBadgeCount > 0 && (
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
              {items.length > 0 && (
                <button
                  onClick={handleClearAll}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    border: "none",
                    background: "none",
                    color: "#9ca3af",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#ca8a04"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Items */}
          {loading && (
            <p style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Loading...
            </p>
          )}

          {!loading && visibleItems.length === 0 && (
            <p style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              No notifications yet.
            </p>
          )}

          {visibleItems.map((item) => (
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
