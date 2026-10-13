import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useEffect, useState } from "react";
import { FiEdit2, FiPlus } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const blank = {
  fullName: "",
  phoneNumber: "",
  position: "",
  hireDate: "",
  status: "ACTIVE",
};

export default function Staff() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [paging, setPaging] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  usePageNotifications(error, notice);

  useEffect(() => {
    let active = true;
    api
      .get("/staff", {
        params: {
          page,
          limit: 20,
          search: search || undefined,
          status: status || undefined,
        },
      })
      .then(({ data }) => {
        if (active) {
          setRows(data.staff || []);
          setPaging(data.pagination || { total: 0, totalPages: 1 });
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(getApiError(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, search, status]);

  function open(row) {
    setEditing(row || null);
    setForm(
      row
        ? {
            fullName: row.fullName || "",
            phoneNumber: row.phoneNumber || "",
            position: row.position || "",
            hireDate: row.hireDate ? row.hireDate.slice(0, 10) : "",
            status: row.status || "ACTIVE",
          }
        : blank,
    );
    setError("");
    setModal(true);
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      ...form,
      fullName: form.fullName.trim(),
      position: form.position.trim(),
      phoneNumber: form.phoneNumber.trim(),
      hireDate: form.hireDate || null,
    };
    try {
      if (editing) await api.put(`/staff/${editing._id}`, payload);
      else await api.post("/staff", payload);
      setModal(false);
      setNotice(editing ? "Staff member updated." : "Staff member added.");
      const { data } = await api.get("/staff", {
        params: {
          page,
          limit: 20,
          search: search || undefined,
          status: status || undefined,
        },
      });
      setRows(data.staff || []);
      setPaging(data.pagination || { total: 0, totalPages: 1 });
    } catch (e) {
      setError(getApiError(e));
    } finally {
      setBusy(false);
    }
  }
  async function deactivate(row) {
    if (!window.confirm(`Deactivate ${row.fullName}?`)) return;
    try {
      const { data } = await api.delete(`/staff/${row._id}`);
      setNotice(data.message || "Staff member deactivated.");
      setRows((list) => list.filter((item) => item._id !== row._id));
    } catch (e) {
      setError(getApiError(e));
    }
  }

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">School directory</span>
          <h2>Staff</h2>
          <p>Manage staff members in your school.</p>
        </div>
        {user?.role === "ADMIN" && (
          <button className="primary-button" onClick={() => open()}>
            <FiPlus /> Add Staff
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
          <input
            aria-label="Search staff"
            className="form-input"
            placeholder="Search name, phone or position"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          <select
            aria-label="Filter status"
            className="form-input"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option>ACTIVE</option>
            <option>INACTIVE</option>
          </select>
        </div>
        {loading ? (
          <div className="school-loading">Loading staff…</div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Position</th>
                    <th>Hire date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row) => (
                      <tr key={row._id}>
                        <td className="table-name">{row.fullName}</td>
                        <td>{row.phoneNumber || "—"}</td>
                        <td>{row.position}</td>
                        <td>
                          {row.hireDate
                            ? new Date(row.hireDate).toLocaleDateString()
                            : "—"}
                        </td>
                        <td>
                          <span
                            className={`status-pill status-${row.status?.toLowerCase()}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td>
                          <div className="school-actions">
                            <button
                              className="edit-link"
                              onClick={() => open(row)}
                            >
                              <FiEdit2 /> Edit
                            </button>
                            {row.status === "ACTIVE" && (
                              <button
                                className="status-action"
                                onClick={() => deactivate(row)}
                              >
                                Deactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="table-message" colSpan="6">
                        No staff members found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="pagination-bar">
              <span>
                {paging.total || 0} staff · Page {page} of{" "}
                {paging.totalPages || 1}
              </span>
              <div>
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <button
                  disabled={page >= (paging.totalPages || 1)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {modal && (
        <div className="modal-backdrop">
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-heading">
              <h2>{editing ? "Edit staff member" : "Add Staff"}</h2>
              <button className="icon-button" onClick={() => setModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={save}>
              <label>Full name</label>
              <input
                className="form-input"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
              <label>Phone number</label>
              <input
                className="form-input"
                type="tel"
                value={form.phoneNumber}
                onChange={(e) =>
                  setForm({ ...form, phoneNumber: e.target.value })
                }
              />
              <label>Position</label>
              <input
                className="form-input"
                required
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
              />
              <label>Hire date</label>
              <input
                className="form-input"
                type="date"
                value={form.hireDate}
                onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
              />
              <label>Status</label>
              <select
                className="form-input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option>ACTIVE</option>
                <option>INACTIVE</option>
              </select>
              {error && (
                <div role="alert" className="form-error">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setModal(false)}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
