import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useCallback, useEffect, useState } from "react";
import { FiEdit2, FiPlus, FiTrash2, FiEye, FiPrinter } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const blankFee = { studentId: "", amount: "", description: "", schoolId: "" };
const blankPayment = {
  amount: "",
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentMethod: "EVC",
  notes: "",
};

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

function studentLabel(student) {
  return `${student.fullName || "Student"}${student.roleNumber ? ` — ${student.roleNumber}` : ""}`;
}

export default function Fees() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManage = ["SUPER_ADMIN", "ADMIN"].includes(user?.role);
  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState("");
  const [editing, setEditing] = useState(null);
  const [selectedFee, setSelectedFee] = useState(null);
  const [form, setForm] = useState(blankFee);
  const [paymentForm, setPaymentForm] = useState(blankPayment);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  usePageNotifications(error, notice);

  const loadFees = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: PAGE_SIZE };
      if (isSuperAdmin && schoolId) params.schoolId = schoolId;
      if (studentFilter && canManage) params.studentId = studentFilter;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/fees", { params });
      setFees(data.fees || []);
      setPagination(
        data.pagination || {
          page,
          total: data.fees?.length || 0,
          totalPages: 1,
        },
      );
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [canManage, isSuperAdmin, page, schoolId, statusFilter, studentFilter]);

  useEffect(() => {
    loadFees();
  }, [loadFees]);

  useEffect(() => {
    if (!receipt) return undefined;
    const printTimer = window.setTimeout(() => {
      window.print();
      setReceipt(null);
    }, 150);
    return () => window.clearTimeout(printTimer);
  }, [receipt]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api
      .get("/schools", { params: { page: 1, limit: 100 } })
      .then(({ data }) => setSchools(data.schools || []))
      .catch((requestError) => setError(getApiError(requestError)));
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!canManage || (isSuperAdmin && !schoolId)) {
      setStudents([]);
      return;
    }
    const params = isSuperAdmin ? { schoolId } : {};
    getAllPages("/students", "students", params)
      .then(setStudents)
      .catch((requestError) => setError(getApiError(requestError)));
  }, [canManage, isSuperAdmin, schoolId]);

  function openCreate() {
    setEditing(null);
    setForm({ ...blankFee, schoolId: isSuperAdmin ? schoolId : "" });
    setError("");
    setModal("fee");
  }

  function openEdit(fee) {
    setEditing(fee);
    setForm({
      studentId: fee.studentId?._id || "",
      amount: String(fee.amount ?? ""),
      description: fee.description || "",
      schoolId: fee.schoolId?._id || fee.schoolId || "",
    });
    setError("");
    setModal("fee");
  }

  async function saveFee(event) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!editing && !form.studentId) {
      setError("Select a student.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter an amount of 0 or more.");
      return;
    }
    if (editing && amount < Number(editing.paidAmount || 0)) {
      setError("The total fee cannot be lower than the amount already paid.");
      return;
    }
    if (!editing && isSuperAdmin && !form.schoolId) {
      setError("Select a school.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const details = { amount, description: form.description.trim() };
    if (!editing) {
      details.studentId = form.studentId;
      if (isSuperAdmin) details.schoolId = form.schoolId;
    }
    try {
      if (editing) await api.put(`/fees/${editing._id}`, details);
      else await api.post("/fees", details);
      setModal("");
      setNotice(
        editing ? "Fee updated successfully." : "Fee created successfully.",
      );
      await loadFees();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteFee(fee) {
    if (!window.confirm(`Delete the fee for ${studentLabel(fee.studentId)}?`))
      return;
    setError("");
    setNotice("");
    try {
      await api.delete(`/fees/${fee._id}`);
      setNotice("Fee deleted successfully.");
      await loadFees();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  function openPayment(fee) {
    setSelectedFee(fee);
    setPaymentForm({
      ...blankPayment,
      paymentDate: new Date().toISOString().slice(0, 10),
    });
    setError("");
    setModal("payment");
  }

  async function savePayment(event) {
    event.preventDefault();
    const amount = Number(paymentForm.amount);
    const remaining =
      Number(selectedFee.amount) - Number(selectedFee.paidAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Payment amount must be greater than 0.");
      return;
    }
    if (amount > remaining) {
      setError(
        `Payment cannot be more than the remaining balance (${remaining}).`,
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const details = {
        feeId: selectedFee._id,
        amount,
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod,
        notes: paymentForm.notes.trim(),
      };
      if (isSuperAdmin)
        details.schoolId =
          selectedFee.schoolId?._id || selectedFee.schoolId || schoolId;
      await api.post("/payments", details);
      setModal("");
      setNotice(
        "Payment recorded successfully. The receipt number is generated by the server.",
      );
      await loadFees();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function openPayments(fee) {
    setSelectedFee(fee);
    setPayments([]);
    setPaymentsLoading(true);
    setError("");
    setModal("payments");
    try {
      const params = isSuperAdmin
        ? { schoolId: fee.schoolId?._id || fee.schoolId }
        : {};
      const { data } = await api.get(`/payments/fee/${fee._id}`, { params });
      setPayments(data.payments || []);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function printReceipt(fee) {
    setError("");
    setPrintingReceipt(true);
    try {
      const params = isSuperAdmin
        ? { schoolId: fee.schoolId?._id || fee.schoolId }
        : {};
      const [{ data }, schoolResponse] = await Promise.all([
        api.get(`/payments/fee/${fee._id}`, { params }),
        isSuperAdmin
          ? api.get(`/schools/${fee.schoolId?._id || fee.schoolId}`)
          : api.get("/schools/me"),
      ]);
      const paymentTotal = (data.payments || []).reduce(
        (total, payment) => total + Number(payment.amount || 0),
        0,
      );
      const totalInCents = (value) => Math.round(Number(value || 0) * 100);
      if (
        data.fee?.status !== "PAID" ||
        !data.payments?.length ||
        totalInCents(paymentTotal) !== totalInCents(data.fee?.paidAmount) ||
        totalInCents(data.fee?.paidAmount) !== totalInCents(data.fee?.amount)
      ) {
        setError(
          "This fee's payment history does not match its paid status. Review the payment records before printing.",
        );
        return;
      }
      const school = schoolResponse.data.school;
      setReceipt({
        fee: data.fee,
        payments: data.payments || [],
        school,
        student: fee.studentId,
      });
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setPrintingReceipt(false);
    }
  }

  function receiptDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
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
    return `${date.getUTCDate()}/${months[date.getUTCMonth()]}/${date.getUTCFullYear()}`;
  }

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">Finance</span>
          <h2>Fees</h2>
          <p>Manage student fees and payment status.</p>
        </div>
        {canManage && (
          <button type="button" className="primary-button" onClick={openCreate}>
            <FiPlus /> Create Fee
          </button>
        )}
      </div>
      {error && !modal && (
        <div role="alert" className="form-error page-message">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="success-message page-message">
          {notice}
        </div>
      )}
      <div className="school-table-card">
        <div className="page-filters">
          {isSuperAdmin && (
            <select
              className="form-input"
              aria-label="Filter by school"
              value={schoolId}
              onChange={(event) => {
                setPage(1);
                setSchoolId(event.target.value);
                setStudentFilter("");
              }}
            >
              <option value="">All schools</option>
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
                  {studentLabel(student)}
                </option>
              ))}
            </select>
          )}
          <select
            className="form-input"
            aria-label="Filter by fee status"
            value={statusFilter}
            onChange={(event) => {
              setPage(1);
              setStatusFilter(event.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
        {loading ? (
          <div className="school-loading">Loading fees…</div>
        ) : (
          <>
            <div className="users-table-title">
              <strong>Fee list</strong>
              <span>{pagination.total} fees</span>
            </div>
            <div className="table-scroll">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Amount</th>
                    <th>Paid Amount</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.map((fee) => {
                    const amount = Number(fee.amount || 0);
                    const paid = Number(fee.paidAmount || 0);
                    return (
                      <tr key={fee._id}>
                        <td className="table-name">
                          {studentLabel(fee.studentId || {})}
                        </td>
                        <td>{amount.toLocaleString()}</td>
                        <td>{paid.toLocaleString()}</td>
                        <td>{Math.max(amount - paid, 0).toLocaleString()}</td>
                        <td>
                          <span
                            className={`status-pill status-${String(fee.status || "unpaid").toLowerCase()}`}
                          >
                            {fee.status}
                          </span>
                        </td>
                        <td>{fee.description || "—"}</td>
                        <td>
                          <div className="school-actions fee-actions">
                            <button
                              type="button"
                              className="fee-icon-button"
                              onClick={() => openPayments(fee)}
                              aria-label={`View payment history for ${studentLabel(fee.studentId || {})}`}
                              title="View payment history"
                            >
                              <FiEye />
                            </button>
                            {canManage && (
                              <>
                                <button
                                  type="button"
                                  className="fee-text-button edit-link"
                                  onClick={() => openEdit(fee)}
                                >
                                  <FiEdit2 /> Edit
                                </button>
                                {paid < amount && (
                                  <button
                                    type="button"
                                    className="fee-text-button status-action"
                                    onClick={() => openPayment(fee)}
                                  >
                                    <FiPlus /> Add Payment
                                  </button>
                                )}
                                {fee.status === "PAID" && (
                                  <button
                                    type="button"
                                    className="fee-text-button status-action"
                                    onClick={() => printReceipt(fee)}
                                    disabled={printingReceipt}
                                  >
                                    <FiPrinter /> Print Receipt
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="fee-icon-button delete"
                                  onClick={() => deleteFee(fee)}
                                  aria-label={`Delete fee for ${studentLabel(fee.studentId || {})}`}
                                  title="Delete fee"
                                >
                                  <FiTrash2 />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!fees.length && (
                    <tr>
                      <td colSpan="7" className="table-message">
                        No fees found.
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
          </>
        )}
      </div>

      {modal === "fee" && (
        <div className="modal-backdrop">
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fee-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Finance</span>
                <h2 id="fee-modal-title">
                  {editing ? "Edit Fee" : "Create Fee"}
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
            <form onSubmit={saveFee}>
              {!editing && isSuperAdmin && (
                <>
                  <label htmlFor="fee-school">School</label>
                  <select
                    id="fee-school"
                    className="form-input"
                    value={form.schoolId}
                    onChange={(event) => {
                      const newSchool = event.target.value;
                      setForm({ ...form, schoolId: newSchool, studentId: "" });
                      setSchoolId(newSchool);
                    }}
                    required
                  >
                    <option value="">Select a school</option>
                    {schools.map((school) => (
                      <option key={school._id} value={school._id}>
                        {school.schoolName}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {!editing && (
                <>
                  <label htmlFor="fee-student">Student</label>
                  <select
                    id="fee-student"
                    className="form-input"
                    value={form.studentId}
                    onChange={(event) =>
                      setForm({ ...form, studentId: event.target.value })
                    }
                    required
                  >
                    <option value="">Select a student</option>
                    {students.map((student) => (
                      <option key={student._id} value={student._id}>
                        {studentLabel(student)}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label htmlFor="fee-amount">Amount</label>
              <input
                id="fee-amount"
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
                required
              />
              <label htmlFor="fee-description">Description</label>
              <textarea
                id="fee-description"
                className="form-input"
                rows="3"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
              {error && (
                <div role="alert" className="form-error">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setModal("")}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Create fee"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modal === "payment" && (
        <div className="modal-backdrop">
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Record payment</span>
                <h2 id="payment-modal-title">Add Payment</h2>
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
            <p className="modal-description">
              Remaining balance:{" "}
              {Math.max(
                Number(selectedFee?.amount || 0) -
                  Number(selectedFee?.paidAmount || 0),
                0,
              ).toLocaleString()}
            </p>
            <form onSubmit={savePayment}>
              <label htmlFor="payment-amount">Amount</label>
              <input
                id="payment-amount"
                className="form-input"
                type="number"
                min="0.01"
                max={Math.max(
                  Number(selectedFee?.amount || 0) -
                    Number(selectedFee?.paidAmount || 0),
                  0,
                )}
                step="0.01"
                value={paymentForm.amount}
                onChange={(event) =>
                  setPaymentForm({ ...paymentForm, amount: event.target.value })
                }
                required
              />
              <label htmlFor="payment-date">Payment Date</label>
              <input
                id="payment-date"
                className="form-input"
                type="date"
                value={paymentForm.paymentDate}
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    paymentDate: event.target.value,
                  })
                }
                required
              />
              <label htmlFor="payment-method">Payment Method</label>
              <select
                id="payment-method"
                className="form-input"
                value={paymentForm.paymentMethod}
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    paymentMethod: event.target.value,
                  })
                }
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
                value={paymentForm.notes}
                onChange={(event) =>
                  setPaymentForm({ ...paymentForm, notes: event.target.value })
                }
              />
              <p className="modal-description">
                Receipt number and fee totals are handled by the payment API.
              </p>
              {error && (
                <div role="alert" className="form-error">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setModal("")}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={saving}>
                  {saving ? "Saving…" : "Record payment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {modal === "payments" && (
        <div className="modal-backdrop">
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payments-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">Fee history</span>
                <h2 id="payments-modal-title">Payments</h2>
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
            {error ? (
              <div role="alert" className="form-error">
                {error}
              </div>
            ) : paymentsLoading ? (
              <div className="school-loading">Loading payments…</div>
            ) : (
              <div className="table-scroll">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Receipt</th>
                      <th>Received By</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment._id}>
                        <td>
                          {payment.paymentDate
                            ? new Date(payment.paymentDate).toLocaleDateString()
                            : "—"}
                        </td>
                        <td>{Number(payment.amount || 0).toLocaleString()}</td>
                        <td>{payment.paymentMethod}</td>
                        <td>{payment.receiptNumber || "—"}</td>
                        <td>{payment.receivedBy?.name || "—"}</td>
                        <td>{payment.notes || "—"}</td>
                      </tr>
                    ))}
                    {!payments.length && (
                      <tr>
                        <td colSpan="6" className="table-message">
                          No payments recorded for this fee.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
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

      {receipt && (
        <article className="print-receipt" aria-label="Fee payment receipt">
          <header className="receipt-header">
            <h1>{receipt.school?.schoolName || "School"}</h1>
            <p>
              {[
                receipt.school?.district,
                receipt.school?.phone,
                receipt.school?.email,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <h2>OFFICIAL PAYMENT RECEIPT</h2>
          </header>
          <div className="receipt-summary">
            <div>
              <span>Student</span>
              <strong>
                {receipt.payments[0]?.studentId?.fullName ||
                  receipt.student?.fullName ||
                  "—"}
              </strong>
            </div>
            <div>
              <span>Role Number</span>
              <strong>
                {receipt.payments[0]?.studentId?.roleNumber ||
                  receipt.student?.roleNumber ||
                  "—"}
              </strong>
            </div>
            <div>
              <span>Fee Description</span>
              <strong>{receipt.fee?.description || "—"}</strong>
            </div>
            <div>
              <span>Total Fee</span>
              <strong>
                {Number(receipt.fee?.amount || 0).toLocaleString()}
              </strong>
            </div>
            <div>
              <span>Total Paid</span>
              <strong>
                {Number(receipt.fee?.paidAmount || 0).toLocaleString()}
              </strong>
            </div>
            <div>
              <span>Remaining Balance</span>
              <strong>
                {Math.max(
                  Number(receipt.fee?.remainingAmount || 0),
                  0,
                ).toLocaleString()}
              </strong>
            </div>
          </div>
          <h3>Payment history</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Receipt Number</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {receipt.payments.map((payment) => (
                <tr key={payment._id}>
                  <td>{receiptDate(payment.paymentDate)}</td>
                  <td>{payment.receiptNumber || "—"}</td>
                  <td>{payment.paymentMethod || "—"}</td>
                  <td>{Number(payment.amount || 0).toLocaleString()}</td>
                  <td>{payment.receivedBy?.name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="receipt-total">
            Total amount paid:{" "}
            <strong>
              {Number(receipt.fee?.paidAmount || 0).toLocaleString()}
            </strong>
          </p>
        </article>
      )}
    </section>
  );
}
