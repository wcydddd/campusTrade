import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { useWs } from "../context/WebSocketContext";
import { useUnread } from "../context/UnreadContext";

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

/** Format single message time: HH:mm, Yesterday HH:mm, or M-D HH:mm */
function formatMessageTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (t.getTime() === today.getTime()) return time;
  if (t.getTime() === yesterday.getTime()) return `Yesterday ${time}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}-${d.getDate()} ${time}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

// ─── Reusable chat panel (accepts props instead of URL params) ───
export function ChatPanel({ otherUserId, productId: urlProductId, onBack }) {
  const navigate = useNavigate();

  const { user } = useAuth();
  const { lastMessage, sendMessage, isConnected } = useWs();
  const { markConversationRead } = useUnread();

  const myId = user?.id || user?._id;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [otherName, setOtherName] = useState("...");
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState(null);
  const [resolvedProductId, setResolvedProductId] = useState(urlProductId);
  const productIdRef = useRef(urlProductId);
  const bottomRef = useRef(null);
  const productSellerId = product?.seller_id;
  const amISeller = productSellerId != null && String(productSellerId) === String(myId);
  const profileLabel = amISeller ? "buyer profile" : "seller profile";
  const openSellerProfile = useCallback(() => {
    if (!otherUserId) return;
    navigate(`/seller/${otherUserId}`);
  }, [navigate, otherUserId]);

  useEffect(() => {
    productIdRef.current = resolvedProductId;
  }, [resolvedProductId]);

  // ── Load product context whenever resolvedProductId changes ──
  useEffect(() => {
    if (!resolvedProductId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/products/${resolvedProductId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          const img =
            resolveMediaUrl(data.images?.[0]) ||
            resolveMediaUrl(data.image_url) ||
            "";
          setProduct({
            id: data.id,
            title: data.title,
            price: data.price,
            image: img,
            seller_id: data.seller_id,
          });
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [resolvedProductId]);

  // ── Load message history (filter by product when ?product= is present) ──
  useEffect(() => {
    let cancelled = false;
    const productParam = urlProductId || productIdRef.current;
    const url = `${API_BASE}/messages?other_user_id=${otherUserId}&limit=100${productParam ? `&product_id=${productParam}` : ""}`;
    (async () => {
      try {
        const res = await authFetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          const list = data
            .map((m) => ({
              id: m.id,
              from: m.from_user_id,
              text: m.content,
              time: m.created_at,
              product_id: m.product_id,
              read: !!m.read,
            }))
            .reverse();
          setMessages(
            list.map((msg) =>
              msg.from === otherUserId ? { ...msg, read: true } : msg
            )
          );
          if (!urlProductId && !productIdRef.current) {
            const withProduct = data.find((m) => m.product_id);
            if (withProduct) setResolvedProductId(withProduct.product_id);
          }
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [otherUserId, urlProductId]);

  // ── Resolve partner name ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/messages/conversations`);
        if (!res.ok) return;
        const data = await res.json();
        const conv = data.find((c) => c.other_user_id === otherUserId);
        if (!cancelled && conv) {
          setOtherName(conv.other_username);
          if (!productIdRef.current && conv.product_id) {
            setResolvedProductId(conv.product_id);
          }
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [otherUserId]);

  // ── Mark messages as read on entering conversation; sync notification badge ──
  useEffect(() => {
    const productParam = urlProductId || resolvedProductId;
    markConversationRead(otherUserId, productParam);

    const chatLink = productParam ? `/chat/${otherUserId}?product=${productParam}` : `/chat/${otherUserId}`;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/notifications/read-by-link`, {
          method: "POST",
          body: JSON.stringify({ link: chatLink }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const total = data.total_unread;
          if (typeof total === "number") {
            window.dispatchEvent(new CustomEvent("notifications:unread_update", { detail: { total_unread: total } }));
          }
        }
      } catch { /* ignore */ }
    })();
  }, [otherUserId, urlProductId, resolvedProductId, markConversationRead]);

  // ── Received read receipt from partner: mark all my sent messages as read ──
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "messages_read") return;
    const r = lastMessage;
    if (String(r.reader_id) !== String(otherUserId)) return;
    setMessages((prev) =>
      prev.map((msg) =>
        msg.from === myId ? { ...msg, read: true } : msg
      )
    );
  }, [lastMessage, otherUserId, myId]);

  // ── Periodically send read receipts while in conversation ──
  useEffect(() => {
    const productParam = urlProductId || resolvedProductId;
    const t = setInterval(() => {
      markConversationRead(otherUserId, productParam || undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [otherUserId, urlProductId, resolvedProductId, markConversationRead]);

  // ── Poll read status: periodically fetch API to sync read state of my messages ──
  useEffect(() => {
    const productParam = urlProductId || resolvedProductId;
    const url = `${API_BASE}/messages?other_user_id=${otherUserId}&limit=100${productParam ? `&product_id=${productParam}` : ""}`;
    const poll = async () => {
      try {
        const res = await authFetch(url);
        if (!res.ok) return;
        const data = await res.json();
        setMessages((prev) => {
          const byId = new Map(data.map((m) => [m.id, { ...m, read: !!m.read }]));
          return prev.map((msg) => {
            if (msg.from !== myId) return msg;
            const fromApi = byId.get(msg.id);
            if (!fromApi || !fromApi.read) return msg;
            return { ...msg, read: true };
          });
        });
      } catch { /* ignore */ }
    };
    const t = setInterval(poll, 2500);
    poll();
    return () => clearInterval(t);
  }, [otherUserId, urlProductId, myId]);

  // ── Receive real-time messages ──
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "chat") return;
    const m = lastMessage;
    const isMine = m.from === myId;
    const isTheirs = m.from === otherUserId;
    if (!isMine && !isTheirs) return;

    setMessages((prev) => [
      ...prev,
      { id: m.message_id, from: m.from, text: m.content, time: m.created_at, product_id: m.product_id, read: !!m.read },
    ]);

    if (m.product_id && !urlProductId && !productIdRef.current) {
      setResolvedProductId(m.product_id);
    }

    if (isTheirs) markConversationRead(otherUserId, m.product_id || undefined);
  }, [lastMessage, myId, otherUserId, markConversationRead]);

  // ── Auto-scroll ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send with product_id context ──
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");

    const payload = { type: "chat", to: otherUserId, content: text };
    if (productIdRef.current) payload.product_id = productIdRef.current;

    const sent = sendMessage(payload);
    if (!sent) {
      try {
        const body = {
          to_user_id: otherUserId,
          content: text,
        };
        if (productIdRef.current) body.product_id = productIdRef.current;
        const res = await authFetch(`${API_BASE}/messages`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json();
          setMessages((prev) => [
            ...prev,
            { id: data.id, from: myId, text, time: data.created_at, product_id: productIdRef.current, read: false },
          ]);
        }
      } catch { /* ignore */ }
    }
  }, [input, otherUserId, sendMessage, myId]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Chat header ── */}
      <div className="shrink-0 border-b border-gray-100 px-5 py-3 flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-lg px-2 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 border-0 bg-transparent cursor-pointer"
          >
            ←
          </button>
        )}
        <button
          type="button"
          onClick={openSellerProfile}
          className="group flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 to-orange-400 text-sm font-bold text-white shrink-0 cursor-pointer border-0 transition hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2"
          title={`View ${profileLabel}`}
          aria-label={`Open ${otherName} ${profileLabel}`}
        >
          {otherName?.charAt(0)?.toUpperCase() || "?"}
        </button>
        <div className="flex flex-1 min-w-0 flex-col">
          <button
            type="button"
            onClick={openSellerProfile}
            className="truncate text-left text-[15px] font-bold text-gray-900 cursor-pointer border-0 bg-transparent p-0 underline-offset-4 transition hover:text-yellow-600 hover:underline focus:outline-none"
            title={`View ${profileLabel}`}
          >
            {otherName}
          </button>
          <button
            type="button"
            onClick={openSellerProfile}
            className="w-fit border-0 bg-transparent p-0 text-xs text-gray-400 cursor-pointer transition hover:text-yellow-600"
            title={`View ${profileLabel}`}
          >
            {`View ${profileLabel}`}
          </button>
        </div>
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${isConnected ? "bg-green-400" : "bg-gray-300"}`}
          title={isConnected ? "Connected" : "Disconnected"}
        />
      </div>

      {/* ── Product snippet card ── */}
      {product && (
        <div className="shrink-0 mx-4 mt-3 mb-1 flex items-center gap-3 rounded-lg bg-gray-50 p-3">
          {product.image && (
            <img
              src={product.image}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">
              {product.title}
            </p>
            <p className="text-sm font-bold text-red-500 mt-0.5">
              £{product.price}
            </p>
          </div>
          <button
            onClick={() => navigate(`/products/${product.id}`)}
            className="shrink-0 rounded-full bg-yellow-400 px-4 py-1.5 text-sm font-medium text-black transition hover:bg-yellow-500 border-0 cursor-pointer"
          >
            View
          </button>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/40">
        {loading && (
          <p className="py-16 text-center text-sm text-gray-400">
            Loading messages...
          </p>
        )}

        {!loading && messages.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center">
            <svg
              width="48" height="48" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1" strokeLinecap="round"
              strokeLinejoin="round" className="text-gray-300 mb-3"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-gray-400">No messages yet. Say hello!</p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m) => {
            const isMine = m.from === myId;
            return (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}
              >
                {/* Partner avatar (only for their messages) */}
                {!isMine && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 to-orange-400 text-xs font-bold text-white">
                    {otherName?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                )}

                <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} max-w-[70%]`}>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      isMine
                        ? "rounded-tr-sm bg-yellow-400 text-black"
                        : "rounded-tl-sm bg-white text-gray-900 shadow-sm"
                    }`}
                  >
                    {m.text}
                  </div>
                  <div className={`mt-1 flex items-center gap-1.5 px-1 ${isMine ? "flex-row-reverse" : ""}`}>
                    <span className="text-[11px] text-gray-400">
                      {formatMessageTime(m.time)}
                    </span>
                    {isMine && (
                      <span className={`text-[11px] ${m.read ? "text-gray-400" : "text-amber-500"}`}>
                        {m.read ? "Read" : "Unread"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input area ── */}
      <div className="shrink-0 border-t border-gray-100 px-4 pt-2 pb-3">
        <div className="flex items-end gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 bg-transparent text-sm outline-none border-0 py-1.5 text-gray-900 placeholder:text-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="shrink-0 rounded-full bg-yellow-400 px-6 py-2 text-sm font-medium text-black transition hover:bg-yellow-500 disabled:opacity-40 border-0 cursor-pointer"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Standalone route wrapper (keeps /chat/:otherUserId working) ───
export default function Chat() {
  const navigate = useNavigate();
  const { otherUserId } = useParams();
  const [searchParams] = useSearchParams();
  const urlProductId = searchParams.get("product");

  return (
    <div className="h-screen">
      <ChatPanel
        otherUserId={otherUserId}
        productId={urlProductId}
        onBack={() => navigate("/conversations")}
      />
    </div>
  );
}
