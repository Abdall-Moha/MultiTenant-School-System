import { useEffect, useState } from "react";
import { usePageNotifications } from "../context/NotificationContext.jsx";
import api, { getApiError } from "../services/api.js";

const intervalLabels = { MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly", CUSTOM: "Custom" };

export default function SubscriptionOverview() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  usePageNotifications(error);
  useEffect(() => {
    let current = true;
    api.get("/subscriptions/mine").then(({ data }) => { if (current) setSubscription(data.subscription); })
      .catch((requestError) => { if (current) setError(getApiError(requestError)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  return <section className="school-page subscription-page">
    <div className="school-heading"><div><span className="eyebrow">Account</span><h2>Subscription Overview</h2><p>View the subscription assigned to your school.</p></div></div>
    {error && <div role="alert" className="form-error page-message">{error}</div>}
    {loading ? <div className="school-loading">Loading subscription…</div> : !subscription ? <div className="school-loading subscription-empty">No subscription has been assigned to your school yet. Please contact the platform administrator.</div> : <>
      <div className="school-form-card subscription-current-plan"><div className="school-card-heading"><div><span className="eyebrow">Current plan</span><h3>{subscription.planName || subscription.planId?.name || "Subscription plan"}</h3></div><span className={`status-pill status-${subscription.status?.toLowerCase()}`}>{subscription.status}</span></div>
        <div className="subscription-plan-highlight"><div><span>School</span><strong>{subscription.schoolId?.schoolName || "Your school"}</strong></div><div><span>Price</span><strong>${Number(subscription.planPrice).toFixed(2)}</strong></div><div><span>Billing interval</span><strong>{intervalLabels[subscription.billingInterval] || subscription.billingInterval}</strong></div><div><span>Payment status</span><strong><span className={`status-pill status-${subscription.paymentStatus?.toLowerCase()}`}>{subscription.paymentStatus}</span></strong></div></div>
      </div>
      <div className="school-form-card"><div className="school-card-heading"><div><span className="eyebrow">Subscription record</span><h3>Details</h3></div></div><div className="school-details-grid">
        <Info label="Start date" value={new Date(subscription.startDate).toLocaleDateString()} /><Info label="End date" value={new Date(subscription.endDate).toLocaleDateString()} /><Info label="Amount paid" value={`$${Number(subscription.amountPaid).toFixed(2)}`} /><Info label="Billing interval" value={intervalLabels[subscription.billingInterval] || subscription.billingInterval} /><Info label="Payment status" value={subscription.paymentStatus} /><Info label="Last updated" value={new Date(subscription.updatedAt).toLocaleString()} />
      </div></div>
    </>}
  </section>;
}

function Info({ label, value }) { return <div className="school-info-item"><span>{label}</span><strong>{value || "—"}</strong></div>; }
