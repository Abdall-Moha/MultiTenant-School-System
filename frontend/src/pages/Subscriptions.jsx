import { useEffect, useState } from "react";
import { FiEye, FiPlus } from "react-icons/fi";
import { usePageNotifications } from "../context/NotificationContext.jsx";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const intervalLabels = { MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly", CUSTOM: "Custom" };
const emptyForm = { schoolId: "", planId: "", startDate: "", endDate: "", amountPaid: "0" };

async function getAllRecords(path, key) {
  const rows = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const { data } = await api.get(path, { params: { page, limit: 100 } });
    rows.push(...(data[key] || []));
    totalPages = data.pagination?.totalPages || 1;
    page += 1;
  }
  return rows;
}

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [plans, setPlans] = useState([]);
  const [schools, setSchools] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  usePageNotifications(error, notice);

  useEffect(() => {
    let current = true;
    api.get("/subscriptions", { params: { page, limit: PAGE_SIZE, search, planId: planFilter, status: statusFilter, paymentStatus: paymentFilter } })
      .then(({ data }) => { if (current) { setSubscriptions(data.subscriptions || []); setPagination(data.pagination || { page, total: 0, totalPages: 1 }); setError(""); } })
      .catch((requestError) => { if (current) setError(getApiError(requestError)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, search, planFilter, statusFilter, paymentFilter]);

  useEffect(() => {
    let current = true;
    Promise.all([getAllRecords("/schools", "schools"), getAllRecords("/subscription-plans", "plans")])
      .then(([schoolRows, planRows]) => { if (current) { setSchools(schoolRows); setPlans(planRows); } })
      .catch((requestError) => { if (current) setError(getApiError(requestError)); });
    return () => { current = false; };
  }, []);

  function openAssign() {
    setForm(emptyForm); setError(""); setNotice(""); setModalOpen(true);
  }

  async function assignSubscription(event) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      await api.post("/subscriptions", { ...form, amountPaid: Number(form.amountPaid) });
      setModalOpen(false); setNotice("Subscription assigned successfully."); setPage(1);
      const { data } = await api.get("/subscriptions", { params: { page: 1, limit: PAGE_SIZE, search, planId: planFilter, status: statusFilter, paymentStatus: paymentFilter } });
      setSubscriptions(data.subscriptions || []); setPagination(data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (requestError) { setError(getApiError(requestError)); }
    finally { setSaving(false); }
  }

  async function updateStatus(status) {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      const { data } = await api.patch(`/subscriptions/${selected._id}`, { status });
      setSelected({ ...selected, ...data.subscription, schoolId: selected.schoolId, planId: selected.planId }); setNotice("Subscription status updated.");
      const response = await api.get("/subscriptions", { params: { page, limit: PAGE_SIZE, search, planId: planFilter, status: statusFilter, paymentStatus: paymentFilter } });
      setSubscriptions(response.data.subscriptions || []);
    } catch (requestError) { setError(getApiError(requestError)); }
    finally { setSaving(false); }
  }

  return <section className="school-page subscription-page">
    <div className="school-heading"><div><span className="eyebrow">Platform billing</span><h2>Subscriptions</h2><p>Assign and review school subscription records.</p></div><button type="button" className="primary-button" onClick={openAssign}><FiPlus /> Assign Subscription</button></div>
    <div className="subscription-summary"><article><span>Matched subscriptions</span><strong>{pagination.total}</strong></article><article><span>Status filter</span><strong>{statusFilter || "All"}</strong></article><article><span>Page</span><strong>{pagination.page || page} of {pagination.totalPages || 1}</strong></article></div>
    <div className="school-table-card"><div className="subscription-filters">
      <input className="form-input subscription-filter-search" value={search} placeholder="Search school" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <select className="form-input" aria-label="Filter by plan" value={planFilter} onChange={(event) => { setPlanFilter(event.target.value); setPage(1); }}><option value="">All plans</option>{plans.map((plan) => <option key={plan._id} value={plan._id}>{plan.name}</option>)}</select>
      <select className="form-input" aria-label="Filter by subscription status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="EXPIRED">Expired</option><option value="CANCELLED">Cancelled</option></select>
      <select className="form-input" aria-label="Filter by payment status" value={paymentFilter} onChange={(event) => { setPaymentFilter(event.target.value); setPage(1); }}><option value="">All payment statuses</option><option value="PENDING">Pending</option><option value="PARTIAL">Partial</option><option value="PAID">Paid</option></select>
    </div>
    {error && <div role="alert" className="form-error page-message">{error}</div>}
    {loading ? <div className="school-loading">Loading subscriptions…</div> : <><div className="table-scroll"><table className="users-table"><thead><tr><th>School</th><th>Plan</th><th>Status</th><th>Price</th><th>Interval</th><th>Start</th><th>End</th><th>Amount paid</th><th>Payment</th><th>Updated</th><th>Action</th></tr></thead>
      <tbody>{subscriptions.length === 0 ? <tr><td colSpan="11" className="table-message">No subscriptions match these filters.</td></tr> : subscriptions.map((item) => <tr key={item._id}>
        <td className="table-name">{item.schoolId?.schoolName || "School"}</td><td>{item.planName || item.planId?.name || "Plan"}</td>
        <td><span className={`status-pill status-${item.status?.toLowerCase()}`}>{item.status}</span></td><td>${Number(item.planPrice).toFixed(2)}</td><td>{intervalLabels[item.billingInterval] || item.billingInterval}</td>
        <td>{new Date(item.startDate).toLocaleDateString()}</td><td>{new Date(item.endDate).toLocaleDateString()}</td><td>${Number(item.amountPaid).toFixed(2)}</td>
        <td><span className={`status-pill status-${item.paymentStatus?.toLowerCase()}`}>{item.paymentStatus}</span></td><td>{new Date(item.updatedAt).toLocaleDateString()}</td>
        <td><button className="edit-link" type="button" onClick={() => { setSelected(item); setError(""); }}><FiEye /> View</button></td>
      </tr>)}</tbody></table></div><div className="pagination-bar"><span>Page {pagination.page || page} of {pagination.totalPages || 1}</span><div>
        <button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button type="button" disabled={loading || page >= (pagination.totalPages || 1)} onClick={() => setPage((value) => Math.min(pagination.totalPages || 1, value + 1))}>Next</button>
      </div></div></>}
    </div>

    {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}><section className="user-modal subscription-modal" role="dialog" aria-modal="true" aria-labelledby="assign-subscription-title">
      <div className="modal-heading"><div><span className="eyebrow">School subscription</span><h2 id="assign-subscription-title">Assign Subscription</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={() => setModalOpen(false)} disabled={saving}>×</button></div>
      <p className="modal-description">Choose existing school and active plan records. A school can have only one active subscription at a time.</p>
      <form onSubmit={assignSubscription}>
        <label htmlFor="subscription-school">School <span className="required-mark">*</span></label><select id="subscription-school" className="form-input" value={form.schoolId} onChange={(event) => setForm({ ...form, schoolId: event.target.value })} required><option value="">Select school</option>{schools.filter((school) => school.status === "ACTIVE").map((school) => <option key={school._id} value={school._id}>{school.schoolName} ({school.schoolId})</option>)}</select>
        <label htmlFor="subscription-plan">Active plan <span className="required-mark">*</span></label><select id="subscription-plan" className="form-input" value={form.planId} onChange={(event) => setForm({ ...form, planId: event.target.value })} required><option value="">Select plan</option>{plans.filter((plan) => plan.isActive).map((plan) => <option key={plan._id} value={plan._id}>{plan.name} — ${Number(plan.price).toFixed(2)} / {intervalLabels[plan.billingInterval]}</option>)}</select>
        <div className="subscription-form-grid"><div><label htmlFor="subscription-start">Start date <span className="required-mark">*</span></label><input id="subscription-start" className="form-input" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required /></div>
          <div><label htmlFor="subscription-end">End date <span className="required-mark">*</span></label><input id="subscription-end" className="form-input" type="date" min={form.startDate || undefined} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} required /></div></div>
        <label htmlFor="subscription-paid">Initial amount recorded as paid</label><input id="subscription-paid" className="form-input" type="number" min="0" step="0.01" value={form.amountPaid} onChange={(event) => setForm({ ...form, amountPaid: event.target.value })} />
        <p className="input-hint">This records an amount only; it does not process a payment.</p>
        {error && <div role="alert" className="form-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="primary-button" disabled={saving || !schools.length || !plans.some((plan) => plan.isActive)}>{saving ? "Saving…" : "Assign subscription"}</button></div>
      </form>
    </section></div>}

    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setSelected(null); }}><section className="user-modal subscription-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-details-title">
      <div className="modal-heading"><div><span className="eyebrow">Subscription details</span><h2 id="subscription-details-title">{selected.schoolId?.schoolName || "School"}</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={() => setSelected(null)} disabled={saving}>×</button></div>
      <div className="payment-details-grid"><Info label="Plan" value={selected.planName || selected.planId?.name} /><Info label="Plan price" value={`$${Number(selected.planPrice).toFixed(2)}`} /><Info label="Billing interval" value={intervalLabels[selected.billingInterval]} /><Info label="Status" value={selected.status} /><Info label="Payment status" value={selected.paymentStatus} /><Info label="Amount paid" value={`$${Number(selected.amountPaid).toFixed(2)}`} /><Info label="Start date" value={new Date(selected.startDate).toLocaleDateString()} /><Info label="End date" value={new Date(selected.endDate).toLocaleDateString()} /><Info label="Last updated" value={new Date(selected.updatedAt).toLocaleString()} /></div>
      <label htmlFor="subscription-update-status">Subscription status</label><select id="subscription-update-status" className="form-input" value={selected.status} onChange={(event) => updateStatus(event.target.value)} disabled={saving}><option value="ACTIVE">Active</option><option value="EXPIRED">Expired</option><option value="CANCELLED">Cancelled</option></select>
      <p className="input-hint">End or cancel the current record before assigning a replacement. Existing plan and price snapshots remain unchanged.</p>
      {error && <div role="alert" className="form-error">{error}</div>}
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setSelected(null)}>Close</button></div>
    </section></div>}
  </section>;
}

function Info({ label, value }) { return <div><span>{label}</span><strong>{value || "—"}</strong></div>; }
