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

export default function Chat() {
  const navigate = useNavigate();
  const { otherUserId } = useParams();
  const [searchParams] = useSearchParams();
  const urlProductId = searchParams.get("product");

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
          });
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [resolvedProductId]);

  // ── Load message history (always load ALL messages, no product filter) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(
          `${API_BASE}/messages?other_user_id=${otherUserId}&limit=100`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMessages(
            data
              .map((m) => ({
                id: m.id,
                from: m.from_user_id,
                text: m.content,
                time: m.created_at,
                product_id: m.product_id,
              }))
              .reverse(),
          );

          if (!productIdRef.current) {
            const withProduct = data.find((m) => m.product_id);
            if (withProduct) {
              setResolvedProductId(withProduct.product_id);
            }
          }
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [otherUserId]);

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

  // ── Mark as read on mount ──
  useEffect(() => {
    markConversationRead(otherUserId);
  }, [otherUserId, markConversationRead]);

  // ── Receive real-time messages ──
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "chat") return;
    const m = lastMessage;
    const isMine = m.from === myId;
    const isTheirs = m.from === otherUserId;
    if (!isMine && !isTheirs) return;

    setMessages((prev) => [
      ...prev,
      { id: m.message_id, from: m.from, text: m.content, time: m.created_at, product_id: m.product_id },
    ]);

    if (m.product_id && !productIdRef.current) {
      setResolvedProductId(m.product_id);
    }

    if (isTheirs) markConversationRead(otherUserId);
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
            { id: data.id, from: myId, text, time: data.created_at, product_id: productIdRef.current },
          ]);
        }
      } catch { /* ignore */ }
    }
  }, [input, otherUserId, sendMessage, myId]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/conversations")}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
            >
              &larr; Back
            </button>
            <h2 className="flex-1 truncate text-center text-base font-semibold text-gray-800">
              {otherName}
            </h2>
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${isConnected ? "bg-green-400" : "bg-gray-300"}`}
              title={isConnected ? "Connected" : "Disconnected"}
            />
          </div>

          {/* ── Product context card ── */}
          {product && (
            <div
              onClick={() => navigate(`/products/${product.id}`)}
              className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-2.5 transition hover:bg-gray-100"
            >
              {product.image && (
                <img
                  src={product.image}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {product.title}
                </p>
                <p className="text-xs font-semibold text-indigo-600">
                  £{product.price}
                </p>
              </div>
              <span className="text-xs text-gray-400">View &rarr;</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Messages ── */}
      <main className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-2xl space-y-3">
          {loading && (
            <p className="py-12 text-center text-sm text-gray-400">
              Loading messages...
            </p>
          )}

          {!loading && messages.length === 0 && (
            <p className="py-12 text-center text-sm text-gray-400">
              No messages yet. Say hello!
            </p>
          )}

          {messages.map((m) => {
            const isMine = m.from === myId;
            return (
              <div
                key={m.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                    isMine
                      ? "rounded-br-md bg-indigo-600 text-white"
                      : "rounded-bl-md bg-white text-gray-800"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* ── Input ── */}
      <footer className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
