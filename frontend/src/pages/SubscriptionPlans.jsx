import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiPlus, FiEye, FiSearch } from "react-icons/fi";
import { usePageNotifications } from "../context/NotificationContext.jsx";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const intervalLabels = { MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly", CUSTOM: "Custom" };

export default function SubscriptionPlans() {
  const [plans, setPlans] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  usePageNotifications(error);

  useEffect(() => {
    let current = true;
    api.get("/subscription-plans", { params: { page, limit: PAGE_SIZE, search, status } })
      .then(({ data }) => {
        if (!current) return;
        setPlans(data.plans || []);
        setPagination(data.pagination || { page, total: data.plans?.length || 0, totalPages: 1 });
        setError("");
      })
      .catch((requestError) => { if (current) setError(getApiError(requestError)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, search, status]);

  function updateSearch(value) { setSearch(value); setPage(1); }

  return (
    <section className="school-page subscription-page">
      <div className="school-heading">
        <div><span className="eyebrow">Platform billing</span><h2>Subscription Plans</h2><p>Manage the plans available to schools.</p></div>
        <Link className="primary-button" to="/subscription-plans/new"><FiPlus /> Add Plan</Link>
      </div>
      <div className="subscription-summary">
        <article><span>Matched plans</span><strong>{pagination.total}</strong></article>
        <article><span>Status filter</span><strong>{status ? status[0].toUpperCase() + status.slice(1) : "All"}</strong></article>
        <article><span>Page</span><strong>{pagination.page || page} of {pagination.totalPages || 1}</strong></article>
      </div>
      <div className="school-table-card">
        <div className="subscription-filters">
          <label className="subscription-search"><FiSearch /><input className="form-input" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Search plan name" /></label>
          <label className="visually-hidden" htmlFor="plan-status">Filter status</label>
          <select id="plan-status" className="form-input" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </div>
        {error && <div role="alert" className="form-error page-message">{error}</div>}
        {loading ? <div className="school-loading">Loading subscription plans…</div> : (
          <><div className="table-scroll"><table className="users-table"><thead><tr><th>Plan</th><th>Price</th><th>Interval</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
            <tbody>{plans.length === 0 ? <tr><td colSpan="6" className="table-message">No plans match these filters. <Link to="/subscription-plans/new">Add a plan</Link></td></tr> : plans.map((plan) => (
              <tr key={plan._id}><td><strong className="table-name">{plan.name}</strong><span className="subscription-description">{plan.description || "No description"}</span></td>
                <td>${Number(plan.price).toFixed(2)}</td><td>{intervalLabels[plan.billingInterval] || plan.billingInterval}</td>
                <td><span className={`status-pill ${plan.isActive ? "status-active" : "status-inactive"}`}>{plan.isActive ? "Active" : "Inactive"}</span></td>
                <td>{plan.createdAt ? new Date(plan.createdAt).toLocaleDateString() : "—"}</td>
                <td><Link className="edit-link" to={`/subscription-plans/${plan._id}`}><FiEye /> View</Link></td></tr>
            ))}</tbody></table></div>
            <div className="pagination-bar"><span>Page {pagination.page || page} of {pagination.totalPages || 1}</span><div>
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || page <= 1}>Previous</button>
              <button type="button" onClick={() => setPage((value) => Math.min(pagination.totalPages || 1, value + 1))} disabled={loading || page >= (pagination.totalPages || 1)}>Next</button>
            </div></div></>
        )}
      </div>
    </section>
  );
}
