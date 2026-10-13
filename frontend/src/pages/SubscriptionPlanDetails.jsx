import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePageNotifications } from "../context/NotificationContext.jsx";
import api, { getApiError } from "../services/api.js";

const labels = { MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly", CUSTOM: "Custom" };

export default function SubscriptionPlanDetails() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  usePageNotifications(error);
  useEffect(() => {
    let current = true;
    api.get(`/subscription-plans/${id}`).then(({ data }) => { if (current) setPlan(data.plan); })
      .catch((requestError) => { if (current) setError(getApiError(requestError)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [id]);
  if (loading) return <div className="school-loading">Loading plan details…</div>;
  return <section className="school-page subscription-page"><div className="school-heading"><div><span className="eyebrow">Plan details</span><h2>{plan?.name || "Subscription Plan"}</h2><p>View and update this platform plan.</p></div><div className="subscription-heading-actions"><Link className="secondary-button" to="/subscription-plans">Back</Link>{plan && <Link className="primary-button" to={`/subscription-plans/${id}/edit`}>Edit Plan</Link>}</div></div>
    {error && <div role="alert" className="form-error page-message">{error}</div>}
    {plan && <div className="school-form-card subscription-detail-card"><div className="school-details-grid">
      <Info label="Plan name" value={plan.name} /><Info label="Description" value={plan.description || "No description"} />
      <Info label="Price" value={`$${Number(plan.price).toFixed(2)}`} /><Info label="Billing interval" value={labels[plan.billingInterval] || plan.billingInterval} />
      <Info label="Status" value={<span className={`status-pill ${plan.isActive ? "status-active" : "status-inactive"}`}>{plan.isActive ? "Active" : "Inactive"}</span>} />
      <Info label="Created" value={plan.createdAt ? new Date(plan.createdAt).toLocaleString() : "—"} /><Info label="Last updated" value={plan.updatedAt ? new Date(plan.updatedAt).toLocaleString() : "—"} />
    </div></div>}</section>;
}

function Info({ label, value }) { return <div className="school-info-item"><span>{label}</span><strong>{value}</strong></div>; }
