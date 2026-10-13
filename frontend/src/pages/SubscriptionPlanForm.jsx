import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useNotification, usePageNotifications } from "../context/NotificationContext.jsx";
import api, { getApiError } from "../services/api.js";

const emptyPlan = { name: "", price: "", billingInterval: "MONTHLY", isActive: true, description: "" };

export default function SubscriptionPlanForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const [form, setForm] = useState(emptyPlan);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  usePageNotifications(error);

  useEffect(() => {
    if (!id) return undefined;
    let current = true;
    api.get(`/subscription-plans/${id}`).then(({ data }) => {
      if (current) setForm({ name: data.plan.name, price: String(data.plan.price), billingInterval: data.plan.billingInterval, isActive: data.plan.isActive, description: data.plan.description || "" });
    }).catch((requestError) => { if (current) setError(getApiError(requestError)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [id]);

  async function savePlan(event) {
    event.preventDefault();
    const price = Number(form.price);
    if (!form.name.trim() || form.price === "" || !Number.isFinite(price) || price < 0) {
      setError("Enter a plan name and a valid price of zero or greater.");
      return;
    }
    setSaving(true); setError("");
    try {
      const payload = { ...form, name: form.name.trim(), price, description: form.description.trim() };
      if (id) await api.put(`/subscription-plans/${id}`, payload);
      else await api.post("/subscription-plans", payload);
      notify("success", id ? "Subscription plan updated." : "Subscription plan created.");
      navigate("/subscription-plans", { replace: true });
    } catch (requestError) { setError(getApiError(requestError)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="school-loading">Loading plan…</div>;
  return (
    <section className="school-page subscription-page">
      <div className="school-heading"><div><span className="eyebrow">Platform billing</span><h2>{id ? "Edit Plan" : "Add Plan"}</h2><p>Set the plan details schools can be assigned.</p></div><Link to="/subscription-plans" className="secondary-button">Back to plans</Link></div>
      <form className="school-form-card subscription-form" onSubmit={savePlan}>
        {error && <div role="alert" className="form-error page-message">{error}</div>}
        <label htmlFor="plan-name">Plan Name <span className="required-mark">*</span></label><input id="plan-name" className="form-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <label htmlFor="plan-price">Price <span className="required-mark">*</span></label><input id="plan-price" className="form-input" type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required />
        <label htmlFor="plan-interval">Billing Interval <span className="required-mark">*</span></label><select id="plan-interval" className="form-input" value={form.billingInterval} onChange={(event) => setForm({ ...form, billingInterval: event.target.value })}><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="YEARLY">Yearly</option><option value="CUSTOM">Custom</option></select>
        <label className="subscription-checkbox"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Active Plan</label>
        <label htmlFor="plan-description">Description</label><textarea id="plan-description" className="form-input subscription-textarea" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <div className="modal-actions"><Link className="secondary-button" to="/subscription-plans">Cancel</Link><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : id ? "Save changes" : "Create Plan"}</button></div>
      </form>
    </section>
  );
}
