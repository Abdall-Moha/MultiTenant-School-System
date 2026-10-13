import { useCallback, useEffect, useState } from "react";
import { FiEdit2, FiEye, FiPlus } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import { useNotification } from "../context/NotificationContext.jsx";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
function localDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const blankForm = {
  feeId: "",
  amount: "",
  paymentDate: localDateValue(),
  paymentMethod: "EVC",
  notes: "",
};
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

async function getAllPages(path, key, params = {}) {
  const records = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const { data } = await api.get(path, {
      params: { ...params, page, limit: 100 },
    });
    records.push(...(data[key] || []));
    totalPages = data.pagination?.totalPages || 1;
    page += 1;
  }

  return records;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return `${date.getUTCDate()}/${months[date.getUTCMonth()]}/${date.getUTCFullYear()}`;
}

function getStudentName(payment) {
  return payment.studentId?.fullName || "Student unavailable";
}

function getFeeStudentName(fee) {
  return fee.studentId?.fullName || "Student";
}

function feeOptionLabel(fee) {
  const amount = Number(fee.amount || 0);
  const paid = Number(fee.paidAmount || 0);
  const remaining = Math.max(amount - paid, 0);
  return `${getFeeStudentName(fee)} — Total: ${amount.toLocaleString()} — Paid: ${paid.toLocaleString()} — Remaining: ${remaining.toLocaleString()}`;
}

export default function Payments() {
  const { user } = useAuth();
  const notify = useNotification();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManage = ["SUPER_ADMIN", "ADMIN"].includes(user?.role);
  const [payments, setPayments] = useState([]);
  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [feesLoading, setFeesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState("");
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [form, setForm] = useState(blankForm);

  const loadPayments = useCallback(async () => {
    if (isSuperAdmin && !schoolId) {
      setPayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (isSuperAdmin) params.schoolId = schoolId;
      if (studentFilter) params.studentId = studentFilter;
      const { data } = await api.get("/payments", { params });
      setPayments(data.payments || []);
      setPagination(
        data.pagination || {
          page,
          total: data.payments?.length || 0,
          totalPages: 1,
        },
      );
    } catch (error) {
      notify("error", getApiError(error));
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, notify, page, schoolId, studentFilter]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    getAllPages("/schools", "schools")
      .then(setSchools)
      .catch((error) => notify("error", getApiError(error)));
  }, [isSuperAdmin, notify]);

  useEffect(() => {
    if (!canManage) return;

    let current = true;
    setFeesLoading(true);
    Promise.all([
      getAllPages("/fees", "fees"),
      isSuperAdmin && !schoolId
        ? Promise.resolve([])
        : getAllPages(
            "/students",
            "students",
            isSuperAdmin ? { schoolId } : {},
          ),
    ])
      .then(([feeItems, studentItems]) => {
        if (!current) return;
        setFees(
          feeItems.filter(
            (fee) => Number(fee.amount) > Number(fee.paidAmount || 0),
          ),
        );
        setStudents(studentItems);
      })
      .catch((error) => notify("error", getApiError(error)))
      .finally(() => {
        if (current) setFeesLoading(false);
      });

    return () => {
      current = false;
    };
  }, [canManage, isSuperAdmin, notify, schoolId]);

  function openCreate() {
    if (isSuperAdmin && !schoolId) {
      notify("error", "Select a school before recording a payment.");
      return;
    }
    setEditingPayment(null);
    setForm({ ...blankForm, paymentDate: localDateValue() });
    setModal("form");
  }

  function openEdit(payment) {
    setEditingPayment(payment);
    setForm({
      feeId: "",
      amount: String(payment.amount ?? ""),
      paymentDate: payment.paymentDate?.slice(0, 10) || "",
      paymentMethod: payment.paymentMethod || "EVC",
      notes: payment.notes || "",
    });
    setModal("form");
  }

  async function openView(payment) {
    try {
      const params = isSuperAdmin ? { schoolId } : {};
      const { data } = await api.get(`/payments/${payment._id}`, { params });
      setSelectedPayment(data.payment || data);
      setModal("view");
    } catch (error) {
      notify("error", getApiError(error));
    }
  }

  function selectedFee() {
    return fees.find((fee) => String(fee._id) === form.feeId);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const amount = Number(form.amount);

    if (!editingPayment && !form.feeId) {
      notify("error", "Select a fee.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      notify("error", "Payment amount must be greater than 0.");
      return;
    }

    if (!editingPayment) {
      const fee = selectedFee();
      const remaining = fee
        ? Number(fee.amount) - Number(fee.paidAmount || 0)
        : 0;
      if (!fee || amount > remaining) {
        notify("error", "Payment cannot exceed the remaining balance.");
        return;
      }
    }

    setSaving(true);
    const details = {
      amount,
      paymentDate: form.paymentDate,
      paymentMethod: form.paymentMethod,
      notes: form.notes.trim(),
    };

    if (editingPayment) {
      if (isSuperAdmin) {
        details.schoolId =
          editingPayment.schoolId?._id || editingPayment.schoolId || schoolId;
      }
    } else {
      details.feeId = form.feeId;
      if (isSuperAdmin) {
        const fee = selectedFee();
        details.schoolId = fee.schoolId?._id || fee.schoolId;
      }
    }

    try {
      if (editingPayment) {
        const { data } = await api.put(
          `/payments/${editingPayment._id}`,
          details,
        );
        notify("success", data.message || "Payment updated successfully.");
      } else {
        const { data } = await api.post("/payments", details);
        notify("success", data.message || "Payment recorded successfully.");
      }
      setModal("");
      await loadPayments();
      if (!editingPayment) {
        const feeItems = await getAllPages("/fees", "fees");
        setFees(
          feeItems.filter(
            (fee) => Number(fee.amount) > Number(fee.paidAmount || 0),
          ),
        );
      }
    } catch (error) {
      notify("error", getApiError(error));
    } finally {
      setSaving(false);
    }
  }

  const currentFee = selectedFee();
  const availableFees = isSuperAdmin
    ? fees.filter(
        (fee) => String(fee.schoolId?._id || fee.schoolId) === String(schoolId),
      )
    : fees;
  const currentRemaining = currentFee
    ? Math.max(
        Number(currentFee.amount) - Number(currentFee.paidAmount || 0),
        0,
      )
    : 0;

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">Finance</span>
          <h2>Payments</h2>
          <p>View and manage student payment records.</p>
        </div>
        {canManage && (
          <button type="button" className="primary-button" onClick={openCreate}>
            <FiPlus /> Record Payment
          </button>
        )}
      </div>

      <div className="page-filters payment-filters">
        {isSuperAdmin && (
          <select
            className="form-input"
            aria-label="Select school"
            value={schoolId}
            onChange={(event) => {
              setPage(1);
              setSchoolId(event.target.value);
              setStudentFilter("");
            }}
          >
            <option value="">Select school</option>
            {schools.map((school) => (
              <option key={school._id} value={school._id}>
                {school.schoolName}
              </option>
            ))}
          </select>
        )}
        {canManage && (
          <select
            className="form-input"
            aria-label="Filter by student"
            value={studentFilter}
            onChange={(event) => {
              setPage(1);
              setStudentFilter(event.target.value);
            }}
          >
            <option value="">All students</option>
            {students.map((student) => (
              <option key={student._id} value={student._id}>
                {student.fullName}
                {student.roleNumber ? ` — ${student.roleNumber}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {isSuperAdmin && !schoolId ? (
        <div className="school-loading">
          Select a school to view its payments.
        </div>
      ) : loading ? (
        <div className="school-loading">Loading payments…</div>
      ) : (
        <div className="school-table-card">
          <div className="users-table-title">
            <strong>Payment records</strong>
            <span>{pagination.total} payments</span>
          </div>
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Amount</th>
                  <th>Payment Date</th>
                  <th>Payment Method</th>
                  <th>Receipt Number</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment._id}>
                    <td className="table-name">{getStudentName(payment)}</td>
                    <td>{Number(payment.amount || 0).toLocaleString()}</td>
                    <td>{formatDate(payment.paymentDate)}</td>
                    <td>{payment.paymentMethod || "—"}</td>
                    <td>{payment.receiptNumber || "—"}</td>
                    <td>{payment.notes || "—"}</td>
                    <td>
                      <div className="school-actions">
                        <button
                          type="button"
                          className="status-action"
                          onClick={() => openView(payment)}
                        >
                          <FiEye /> View
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            className="edit-link"
                            onClick={() => openEdit(payment)}
                          >
                            <FiEdit2 /> Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!payments.length && (
                  <tr>
                    <td colSpan="7" className="table-message">
                      No payments found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="pagination-bar">
              <span>
                Page {page} of {pagination.totalPages}
              </span>
              <div>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {modal === "form" && (
        <div className="modal-backdrop">
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-form-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Finance</span>
                <h2 id="payment-form-title">
                  {editingPayment ? "Edit Payment" : "Record Payment"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModal("")}
                disabled={saving}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              {!editingPayment && (
                <>
                  <label htmlFor="payment-fee">Fee</label>
                  <select
                    id="payment-fee"
                    className="form-input"
                    value={form.feeId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        feeId: event.target.value,
                        amount: "",
                      })
                    }
                    required
                  >
                    <option value="">Select a fee</option>
                    {availableFees.map((fee) => (
                      <option key={fee._id} value={fee._id}>
                        {feeOptionLabel(fee)}
                      </option>
                    ))}
                  </select>
                  {feesLoading ? (
                    <p className="modal-description">
                      Loading outstanding fees…
                    </p>
                  ) : (
                    !availableFees.length && (
                      <p className="modal-description">
                        No outstanding fees available.
                      </p>
                    )
                  )}
                  {currentFee && (
                    <p className="payment-balance">
                      Remaining balance: {currentRemaining.toLocaleString()}
                    </p>
                  )}
                </>
              )}
              <label htmlFor="payment-amount">Payment Amount</label>
              <input
                id="payment-amount"
                className="form-input"
                type="number"
                min="0.01"
                step="0.01"
                max={
                  !editingPayment && currentFee ? currentRemaining : undefined
                }
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
                required
              />
              {!editingPayment &&
                currentFee &&
                Number(form.amount) > currentRemaining && (
                  <p className="payment-inline-error">
                    Payment cannot exceed the remaining balance.
                  </p>
                )}
              <label htmlFor="payment-date">Payment Date</label>
              <input
                id="payment-date"
                className="form-input"
                type="date"
                value={form.paymentDate}
                onChange={(event) =>
                  setForm({ ...form, paymentDate: event.target.value })
                }
                required
              />
              <label htmlFor="payment-method">Payment Method</label>
              <select
                id="payment-method"
                className="form-input"
                value={form.paymentMethod}
                onChange={(event) =>
                  setForm({ ...form, paymentMethod: event.target.value })
                }
                required
              >
                <option value="EVC">EVC</option>
                <option value="E-Dahab">E-Dahab</option>
                <option value="BANK">BANK</option>
              </select>
              <label htmlFor="payment-notes">Notes</label>
              <textarea
                id="payment-notes"
                className="form-input"
                rows="3"
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setModal("")}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={
                    saving || (!editingPayment && !availableFees.length)
                  }
                >
                  {saving
                    ? "Saving…"
                    : editingPayment
                      ? "Save changes"
                      : "Record payment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modal === "view" && selectedPayment && (
        <div className="modal-backdrop">
          <section
            className="user-modal payment-view-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-view-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Payment receipt</span>
                <h2 id="payment-view-title">Payment Details</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModal("")}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="payment-details-grid">
              <div>
                <span>Student</span>
                <strong>{getStudentName(selectedPayment)}</strong>
              </div>
              <div>
                <span>Amount</span>
                <strong>
                  {Number(selectedPayment.amount || 0).toLocaleString()}
                </strong>
              </div>
              <div>
                <span>Payment Date</span>
                <strong>{formatDate(selectedPayment.paymentDate)}</strong>
              </div>
              <div>
                <span>Payment Method</span>
                <strong>{selectedPayment.paymentMethod || "—"}</strong>
              </div>
              <div>
                <span>Receipt Number</span>
                <strong>{selectedPayment.receiptNumber || "—"}</strong>
              </div>
              <div>
                <span>Notes</span>
                <strong>{selectedPayment.notes || "—"}</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModal("")}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
