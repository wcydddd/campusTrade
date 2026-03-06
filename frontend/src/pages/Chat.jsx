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

/** 单条消息时间：HH:mm 或 昨天 HH:mm / M-D HH:mm */
function formatMessageTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (t.getTime() === today.getTime()) return time;
  if (t.getTime() === yesterday.getTime()) return `昨天 ${time}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}-${d.getDate()} ${time}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${time}`;
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

  // ── Load message history (严格按商品过滤：带 ?product= 时只拉该商品对话) ──
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
          // 进入对话即视为已读：对方发来的消息在本地显示为已读（后端会在 markConversationRead 里标记）
          setMessages(
            list.map((msg) =>
              msg.from === otherUserId ? { ...msg, read: true } : msg
            )
          );
          // 仅在没有通过 URL 指定商品时，才从首条消息推断商品（避免覆盖成别的商品）
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

  // ── 进入对话时标记消息已读，并同步把指向该聊天的通知标为已读（通知铃铛与 Messages 同步） ──
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

  // ── 收到对方「已读」回执：把我发出去的消息都标为已读（统一转字符串再比较） ──
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

  // ── 在对话页时定期发送已读回执，保证对方能收到「已读」状态（两人都在线时生效） ──
  useEffect(() => {
    const productParam = urlProductId || resolvedProductId;
    const t = setInterval(() => {
      markConversationRead(otherUserId, productParam || undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [otherUserId, urlProductId, resolvedProductId, markConversationRead]);

  // ── 轮询已读状态：不依赖 WebSocket，在对话页时定期拉取接口并同步「我发的」消息的 read（解决双方都在对话里仍显示未读） ──
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
                className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
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
                <div className={`mt-0.5 flex items-center gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                  <span className="text-[11px] text-gray-400">
                    {formatMessageTime(m.time)}
                  </span>
                  {isMine && (
                    <span className={`text-[11px] ${m.read ? "text-gray-400" : "text-amber-500"}`}>
                      {m.read ? "已读" : "未读"}
                    </span>
                  )}
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
