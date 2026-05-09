const { useEffect, useMemo, useState } = React;
const {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} = Recharts;

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function byStatus(list, status) {
  return (list || []).filter((t) => String(t.status || "").toUpperCase() === status);
}

function App() {
  const [role, setRole] = useState("owner");
  const [orders, setOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [system, setSystem] = useState({});
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState([{ who: "ai", text: "Command Center online. Ask for insights." }]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setError("");
      const [o, t, s] = await Promise.all([
        getJson("/api/orders?limit=20"),
        getJson("/api/staff/prisma-tasks?limit=50"),
        getJson("/api/system/status"),
      ]);
      setOrders(Array.isArray(o.data) ? o.data : Array.isArray(o.orders) ? o.orders : []);
      setTasks(Array.isArray(t.data) ? t.data : Array.isArray(t.tasks) ? t.tasks : []);
      setSystem(s || {});
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);

  const revenueData = useMemo(() => {
    const byDay = {};
    for (const o of orders) {
      const d = new Date(o.createdAt || Date.now());
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      const val = Number(o.total || o.totalCents / 100 || 0);
      byDay[key] = (byDay[key] || 0) + val;
    }
    return Object.entries(byDay).slice(-7).map(([day, revenue]) => ({ day, revenue }));
  }, [orders]);

  const todayRevenue = revenueData[revenueData.length - 1]?.revenue || 0;
  const invoiceCount = orders.length;
  const depositTotal = orders.reduce((sum, o) => sum + Number(o.depositAmount || 0), 0);

  async function advance(taskId) {
    try {
      await getJson(`/api/tasks/${encodeURIComponent(taskId)}/advance`, { method: "POST" });
      await refresh();
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const user = { who: "user", text: chatInput.trim() };
    setChat((c) => [...c, user]);
    setChatInput("");
    try {
      const context = {
        orders: orders.slice(0, 5),
        tasks: tasks.slice(0, 5),
      };
      const res = await getJson("/api/cheeky-ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: user.text, context }),
      });
      const aiText = res.answer || res.message || JSON.stringify(res);
      setChat((c) => [...c, { who: "ai", text: aiText }]);
    } catch (e) {
      setChat((c) => [...c, { who: "ai", text: `AI chat error: ${e.message || String(e)}` }]);
    }
  }

  const health = [
    { name: "AI", ok: Boolean(system.aiOnline ?? true) },
    { name: "Email", ok: Boolean(system.emailOnline ?? true) },
    { name: "Square", ok: Boolean(system.squareOnline ?? true) },
    { name: "Notifications", ok: Boolean(system.notificationsOnline ?? true) },
    { name: "Last Order", ok: Boolean(orders[0]) },
  ];

  return (
    <div className="app-shell">
      <div className="header">
        <div className="brand">
          <div className="brand-dot" />
          <strong>Cheeky Tees Command Center</strong>
        </div>
        <div>
          <label>
            Role:
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="owner">Owner View</option>
              <option value="operator">Operator View</option>
            </select>
          </label>
        </div>
      </div>

      <div className="main-grid">
        {role === "owner" && (
          <section className="panel revenue">
            <h3>REVENUE PULSE</h3>
            <div className="stats">
              <div className="stat"><strong>${todayRevenue.toFixed(2)}</strong>Today</div>
              <div className="stat"><strong>{invoiceCount}</strong>Invoices</div>
              <div className="stat"><strong>${depositTotal.toFixed(2)}</strong>Deposits</div>
            </div>
            <div style={{ width: "100%", height: 180 }}>
              <ResponsiveContainer>
                <LineChart data={revenueData}>
                  <CartesianGrid stroke="#1d1d2d" />
                  <XAxis dataKey="day" stroke="#8f8fa6" />
                  <YAxis stroke="#8f8fa6" />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#f5a623" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <section className="panel orders">
          <h3>LIVE ORDERS FEED</h3>
          <table className="table">
            <thead>
              <tr><th>Customer</th><th>Product</th><th>Status</th><th>Time</th></tr>
            </thead>
            <tbody>
              {orders.slice(0, 12).map((o) => (
                <tr key={o.id || Math.random()}>
                  <td>{o.customerName || o.name || "Unknown"}</td>
                  <td>{o.product || o.item || "Order"}</td>
                  <td>{o.status || "-"}</td>
                  <td>{new Date(o.createdAt || Date.now()).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel chat">
          <h3>AI CHAT WINDOW</h3>
          <div className="chat-log">
            {chat.map((m, i) => (
              <div className={`msg ${m.who}`} key={i}>{m.text}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ flex: 1, background: "#0f0f16", border: "1px solid #2d2d47", color: "#e8e8f0", borderRadius: 6, padding: 8 }}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Claude about orders and tasks..."
            />
            <button onClick={sendChat}>Send</button>
          </div>
        </section>

        <section className="panel tasks">
          <h3>PRODUCTION TASK BOARD</h3>
          <div className="kanban">
            <div className="col">
              <strong>PENDING</strong>
              {byStatus(tasks, "PENDING").map((t) => (
                <div className="task-card" key={t.id}>
                  <div>{t.title || t.name || t.id}</div>
                  <small>{t.orderId || ""}</small>
                  <div style={{ marginTop: 6 }}><button onClick={() => advance(t.id)}>Advance</button></div>
                </div>
              ))}
            </div>
            <div className="col">
              <strong>IN_PROGRESS</strong>
              {byStatus(tasks, "IN_PROGRESS").map((t) => (
                <div className="task-card" key={t.id}>
                  <div>{t.title || t.name || t.id}</div>
                  <small>{t.orderId || ""}</small>
                  <div style={{ marginTop: 6 }}><button onClick={() => advance(t.id)}>Advance</button></div>
                </div>
              ))}
            </div>
            <div className="col">
              <strong>COMPLETE</strong>
              {byStatus(tasks, "COMPLETE").map((t) => (
                <div className="task-card" key={t.id}>
                  <div>{t.title || t.name || t.id}</div>
                  <small>{t.orderId || ""}</small>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div>
        <div className="health-bar">
          {health.map((h) => (
            <div className="health-item" key={h.name}>
              <span className={`dot ${h.ok ? "ok" : "err"}`} />
              <span>{h.name}</span>
            </div>
          ))}
        </div>
        {error ? <div style={{ color: "#ff4444", marginTop: 8 }}>{error}</div> : null}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
