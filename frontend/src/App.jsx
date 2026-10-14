import React from 'react';
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, RadioTower, PackageSearch, MapPin, Clock3, CheckCircle2,
  AlertCircle, Plus, RefreshCw, ArrowUpRight, X, Wifi
} from "lucide-react";

const API = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY || "";

function formatDate(value) {
  if (!value) return "Not detected yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not detected yet" : date.toLocaleString();
}
function statusLabel(status) {
  return ({ lost: "Missing", found: "Detected", returned: "Returned", active: "Active" })[status] || status;
}
function StatusPill({ status }) {
  return <span className={`pill ${String(status).toLowerCase()}`}>{statusLabel(status)}</span>;
}

const emptyForm = { uid: "", name: "", category: "Electronics", description: "" };

export default function App() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/items`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load items.");
      setItems(data.items || []);
    } catch (err) {
      setError(`${err.message}. Check the API URL and backend status.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      const matchesStatus = filter === "ALL" || item.status === filter;
      const matchesQuery = !q || [
        item.name, item.uid, item.category, item.lastSeenLocation,
        item.description
      ].some(value => String(value || "").toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [items, query, filter]);

  const counts = useMemo(() => ({
    total: items.length,
    missing: items.filter(i => i.status === "lost").length,
    found: items.filter(i => i.status === "found").length,
    returned: items.filter(i => i.status === "returned").length
  }), [items]);

  async function createItem(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API}/api/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not report item.");
      setNotice(`${data.item.name} has been reported missing.`);
      setForm(emptyForm);
      setShowForm(false);
      await loadItems();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item, status) {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API}/api/items/${item._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
        body: JSON.stringify({ status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update status.");
      setNotice(`${item.name} marked ${statusLabel(status).toLowerCase()}.`);
      await loadItems();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><RadioTower size={21} /></div>
          <div><strong>CampusTrace</strong><span>SMART CAMPUS IOT</span></div>
        </div>
        <div className="side-label">WORKSPACE</div>
        <div className="nav-item active"><PackageSearch size={18} /> Lost & found</div>
        <div className="side-note">
          <div className="live-dot" />
          <div><strong>Tracking system</strong><span>IoT connection ready for scans</span></div>
        </div>
        <div className="sidebar-bottom">
          <div className="campus-icon"><Wifi size={17} /></div>
          <div><strong>Campus network</strong><span>Simulation environment</span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> Lost & found</div>
          <div className="topbar-right"><span className="status-dot" /> Demo environment <span className="avatar">CT</span></div>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow">CAMPUS OPERATIONS / IOT</div>
            <h1>Lost-item tracking</h1>
            <p>Find misplaced belongings through RFID detections across campus.</p>
          </div>
          <button className="primary-button" onClick={() => { setShowForm(true); setError(""); }}>
            <Plus size={17} /> Report an item
          </button>
        </section>

        {error && <div className="alert error"><AlertCircle size={18} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}
        {notice && <div className="alert success"><CheckCircle2 size={18} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} /></button></div>}

        <section className="stats-grid">
          <StatCard label="Registered items" value={counts.total} note="All tracked belongings" icon={<PackageSearch size={19} />} />
          <StatCard label="Reported missing" value={counts.missing} note="Awaiting a detection" icon={<AlertCircle size={19} />} />
          <StatCard label="Recently detected" value={counts.found} note="Location recorded by IoT" icon={<RadioTower size={19} />} />
          <StatCard label="Returned" value={counts.returned} note="Successfully reunited" icon={<CheckCircle2 size={19} />} />
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div><h2>Item directory</h2><p>Search reports and view the latest known location.</p></div>
            <button className="icon-button" onClick={loadItems} title="Refresh items"><RefreshCw size={17} /></button>
          </div>
          <div className="toolbar">
            <div className="search-box"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, code, category or location..." /></div>
            <div className="filter-tabs">
              {[["ALL", "All items"], ["lost", "Missing"], ["found", "Detected"], ["returned", "Returned"]].map(([key, label]) =>
                <button key={key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)}>{label}</button>
              )}
            </div>
          </div>

          {loading ? <div className="empty-state"><RefreshCw className="spin" size={22} /><p>Loading item directory…</p></div> :
            visibleItems.length === 0 ? <div className="empty-state"><PackageSearch size={28} /><strong>No items found</strong><p>Try another search or report a missing item.</p></div> :
            <div className="table-wrap">
              <table>
                <thead><tr><th>ITEM</th><th>STATUS</th><th>LAST DETECTED LOCATION</th><th>LAST SCAN</th><th>ACTION</th></tr></thead>
                <tbody>{visibleItems.map(item =>
                  <tr key={item._id}>
                    <td><div className="item-cell"><div className="item-symbol">{(item.name || "?").slice(0, 1).toUpperCase()}</div><div><strong>{item.name}</strong><span>{item.uid} · {item.category}</span></div></div></td>
                    <td><StatusPill status={item.status} /></td>
                    <td><div className="location-cell"><MapPin size={15} /><span>{item.lastSeenLocation || "No detection yet"}</span></div></td>
                    <td><div className="time-cell"><Clock3 size={14} /><span>{formatDate(item.lastSeenAt)}</span></div></td>
                    <td><select className="status-select" value={item.status} onChange={e => updateStatus(item, e.target.value)} aria-label={`Update ${item.name} status`}>
                      <option value="lost">Mark missing</option><option value="found">Mark detected</option><option value="returned">Mark returned</option>
                    </select></td>
                  </tr>
                )}</tbody>
              </table>
            </div>
          }
          <div className="table-footer"><span>Showing {visibleItems.length} of {items.length} items</span><span><span className="live-dot" /> Live data from API <ArrowUpRight size={13} /></span></div>
        </section>

        <section className="info-banner">
          <div className="info-icon"><RadioTower size={20} /></div>
          <div><strong>How location tracking works</strong><p>When a registered RFID tag is scanned by the simulated ESP32 reader, its UID and reader location are sent to the API. A physical campus deployment needs readers at each tracking point.</p></div>
        </section>
        <footer>CampusTrace · Smart Campus Lost-Item Tracking · IoT academic prototype</footer>
      </main>

      {showForm && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
        <section className="modal">
          <div className="modal-heading"><div><div className="eyebrow">NEW REPORT</div><h2>Report a missing item</h2><p>Register the item and connect its RFID tag.</p></div><button className="icon-button" onClick={() => setShowForm(false)} aria-label="Close"><X size={18} /></button></div>
          <form onSubmit={createItem}>
            <div className="form-grid">
              <Field label="RFID tag UID *" hint="Hex UID from Wokwi Serial Monitor"><input required value={form.uid} onChange={e => setForm({ ...form, uid: e.target.value.toUpperCase() })} placeholder="A1B2C3D4" /></Field>
              <Field label="Item name *"><input required maxLength="120" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Black wallet" /></Field>
              <Field label="Category *"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option>Electronics</option><option>ID Card</option><option>Bag</option><option>Wallet</option><option>Keys</option><option>Books</option><option>Clothing</option><option>Other</option></select></Field>
              <Field label="Description"><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Distinctive details" maxLength="1000" /></Field>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Register missing item"}</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}

function StatCard({ label, value, note, icon }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className="stat-icon">{icon}</div></div><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></div>;
}
function Field({ label, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
