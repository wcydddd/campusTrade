import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function Chat() {
  const navigate = useNavigate();
  const { productId } = useParams();

  // 模拟“对话对象/商品信息”（后面接 API 再换）
  const title = useMemo(() => `Chat about Product #${productId}`, [productId]);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { id: 1, from: "seller", text: "Hi! Is this still available?" },
    { id: 2, from: "me", text: "Yes, it is. Are you interested?" },
  ]);

  function sendMessage() {
    const text = input.trim();
    if (!text) return;

    const myMsg = { id: Date.now(), from: "me", text };
    setMessages((prev) => [...prev, myMsg]);
    setInput("");

    // ✅ 模拟对方回复（演示用）
    setTimeout(() => {
      const reply = {
        id: Date.now() + 1,
        from: "seller",
        text: "Sounds good! When can we meet on campus?",
      };
      setMessages((prev) => [...prev, reply]);
    }, 700);
  }

  function onKeyDown(e) {
    if (e.key === "Enter") sendMessage();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f8", padding: 20 }}>
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          background: "white",
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <button onClick={() => navigate(-1)}>← Back</button>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div style={{ width: 80 }} />
        </div>

        <div
          style={{
            height: 420,
            overflowY: "auto",
            padding: 12,
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: m.from === "me" ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: m.from === "me" ? "#0f172a" : "#e2e8f0",
                  color: m.from === "me" ? "white" : "#0f172a",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              outline: "none",
            }}
          />
          <button
            onClick={sendMessage}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              background: "#0f172a",
              color: "white",
              cursor: "pointer",
            }}
          >
            Send
          </button>
        </div>

        <p style={{ marginTop: 10, color: "#64748b", fontSize: 12 }}>
          * Demo chat: messages are local and simulated. Real-time chat requires
          backend (WebSocket + DB).
        </p>
      </div>
    </div>
  );
}