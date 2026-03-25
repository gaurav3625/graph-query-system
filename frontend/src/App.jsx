import GraphView from "./GraphView.jsx";
import ChatPanel from "./ChatPanel.jsx";

function App() {
  const navbarHeight = 64;

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <nav
        style={{
          height: `${navbarHeight}px`,
          backgroundColor: "#16213e",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          boxSizing: "border-box",
          fontSize: "1.1rem",
          fontWeight: 600,
        }}
      >
        SAP O2C Graph Explorer
      </nav>

      <main
        style={{
          height: `calc(100vh - ${navbarHeight}px)`,
          display: "flex",
          flexDirection: "row",
        }}
      >
        <section
          style={{
            width: "65%",
            height: "100%",
            overflow: "hidden",
          }}
        >
          <GraphView />
        </section>

        <aside
          style={{
            width: "35%",
            height: "100%",
            backgroundColor: "#1a1a2e",
            overflow: "hidden",
          }}
        >
          <ChatPanel />
        </aside>
      </main>
    </div>
  );
}

export default App;
