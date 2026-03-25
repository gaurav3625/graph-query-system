import { useEffect, useRef, useState } from "react";

function ChatPanel() {
  const exampleQueries = [
    "Which products have the most billing documents?",
    "Trace billing document flow for a sales order",
    "Find sales orders delivered but not billed",
  ];

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! Ask me anything about the SAP O2C data — sales orders, deliveries, billing documents, payments, customers or products.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async (messageText = input) => {
    const trimmed = messageText.trim();
    if (!trimmed || isLoading) return;

    const userMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      const data = await response.json();
      const answer =
        typeof data?.answer === "string" && data.answer.trim()
          ? data.answer
          : "Sorry, I could not generate an answer.";

      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I could not reach the server right now.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleExampleClick = (query) => {
    if (isLoading) return;
    setInput(query);
    sendMessage(query);
  };

  return (
    <div
      style={{
        height: "100%",
        backgroundColor: "#1a1a2e",
        display: "flex",
        flexDirection: "column",
        color: "#ffffff",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #2f2f46",
          fontWeight: 700,
          fontSize: "1rem",
        }}
      >
        AI Query Assistant
      </div>

      <div
        style={{
          flexGrow: 1,
          overflowY: "auto",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {messages.map((message, index) => {
          const isUser = message.role === "user";
          return (
            <div
              key={`${message.role}-${index}`}
              style={{
                display: "flex",
                justifyContent: isUser ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "85%",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.4,
                  backgroundColor: isUser ? "#ffffff" : "#2d2d44",
                  color: isUser ? "#2563eb" : "#ffffff",
                }}
              >
                {message.content}
              </div>
            </div>
          );
        })}

        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                backgroundColor: "#2d2d44",
                color: "#ffffff",
                borderRadius: "12px",
                padding: "10px 12px",
                width: "52px",
                textAlign: "center",
                fontWeight: 700,
                animation: "pulse 1s infinite",
              }}
            >
              ...
            </div>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 0.35; }
          50% { opacity: 1; }
          100% { opacity: 0.35; }
        }
      `}</style>

      <div
        style={{
          borderTop: "1px solid #2f2f46",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {exampleQueries.map((query) => (
            <button
              key={query}
              type="button"
              onClick={() => handleExampleClick(query)}
              disabled={isLoading}
              style={{
                backgroundColor: "#2d2d44",
                color: "#e2e8f0",
                border: "1px solid #3b3b5a",
                borderRadius: "999px",
                padding: "6px 10px",
                fontSize: "11px",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              {query}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the business data..."
          style={{
            flexGrow: 1,
            backgroundColor: "#101024",
            color: "#ffffff",
            border: "1px solid #3b3b5a",
            borderRadius: "8px",
            padding: "10px 12px",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          style={{
            backgroundColor: "#2563eb",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            padding: "10px 14px",
            cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
            opacity: isLoading || !input.trim() ? 0.6 : 1,
            fontWeight: 600,
          }}
        >
          Send
        </button>
        </div>
      </div>
    </div>
  );
}

export default ChatPanel;
