import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useEffect, useState } from "react";
import { FiBookOpen, FiEdit2, FiPlus } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError, getAssetUrl } from "../services/api.js";

const PAGE_SIZE = 20;
const emptySchool = {
  schoolId: "",
  schoolName: "",
  district: "",
  phone: "",
  email: "",
  principalName: "",
};

export default function School() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [schools, setSchools] = useState([]);
  const [school, setSchool] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);
  const [form, setForm] = useState(emptySchool);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  usePageNotifications(error, success);

  useEffect(() => {
    return () => {
      if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  async function loadSchoolData() {
    setLoading(true);
    setError("");
    try {
      if (isSuperAdmin) {
        const { data } = await api.get("/schools", {
          params: { page, limit: PAGE_SIZE },
        });
        setSchools(data.schools || []);
        setPagination(
          data.pagination || {
            page,
            total: data.schools?.length || 0,
            totalPages: 1,
          },
        );
      } else {
        const { data } = await api.get("/schools/me");
        setSchool(data.school);
      }
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isCurrentRequest = true;
    const request = isSuperAdmin
      ? api.get("/schools", { params: { page, limit: PAGE_SIZE } })
      : api.get("/schools/me");

    request
      .then(({ data }) => {
        if (!isCurrentRequest) return;
        if (isSuperAdmin) {
          setSchools(data.schools || []);
          setPagination(
            data.pagination || {
              page,
              total: data.schools?.length || 0,
              totalPages: 1,
            },
          );
        } else {
          setSchool(data.school);
        }
      })
      .catch((requestError) => {
        if (isCurrentRequest) setError(getApiError(requestError));
      })
      .finally(() => {
        if (isCurrentRequest) setLoading(false);
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [isSuperAdmin, page]);

  function openCreateForm() {
    setEditingSchool(null);
    setForm(emptySchool);
    setLogoFile(null);
    setLogoPreview("");
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function openEditForm(target) {
    setEditingSchool(target);
    setForm({
      schoolId: target.schoolId || "",
      schoolName: target.schoolName || "",
      district: target.district || "",
      phone: target.phone || "",
      email: target.email || "",
      principalName: target.principalName || "",
    });
    setLogoFile(null);
    setLogoPreview("");
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function selectSchoolLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Choose a PNG, JPG, JPEG, or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("School logo must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }
    setError("");
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function closeSchoolModal() {
    setModalOpen(false);
    setLogoFile(null);
    setLogoPreview("");
  }

  async function saveSchool(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    const details = {
      schoolName: form.schoolName.trim(),
      district: form.district.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      principalName: form.principalName.trim(),
    };
    try {
      // Send the school fields and optional logo together as multipart form data.
      const schoolData = new FormData();
      Object.entries(details).forEach(([key, value]) => schoolData.append(key, value));
      if (logoFile) schoolData.append("logo", logoFile);
      if (editingSchool) {
        const { data } = await api.put(
          `/schools/${editingSchool._id}`,
          schoolData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        if (!isSuperAdmin) setSchool(data.school);
        setSuccess("School information updated successfully.");
        window.dispatchEvent(new Event("school-branding-updated"));
      } else {
        schoolData.append("schoolId", form.schoolId.trim().toUpperCase());
        await api.post("/schools", schoolData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setSuccess("School created successfully.");
      }
      closeSchoolModal();
      await loadSchoolData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(target) {
    const status = target.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setError("");
    setSuccess("");
    setStatusUpdating(String(target._id));
    try {
      const { data } = await api.patch(`/schools/${target._id}/status`, {
        status,
      });
      setSuccess(
        data.message || `School ${status.toLowerCase()} successfully.`,
      );
      await loadSchoolData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setStatusUpdating("");
    }
  }

  const pageTitle = isSuperAdmin ? "Schools" : "School";

  return (
    <section className="school-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">School management</span>
          <h2>{pageTitle}</h2>
          <p>
            {isSuperAdmin
              ? "View and manage schools across the platform."
              : "Manage your school's basic information."}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            className="primary-button"
            type="button"
            onClick={openCreateForm}
          >
            <FiPlus /> Add School
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="form-error page-message">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="success-message page-message">
          {success}
        </div>
      )}

      {loading ? (
        <div className="school-loading">Loading school information…</div>
      ) : isSuperAdmin ? (
        <>
          <div className="school-table-card">
            <div className="users-table-title">
              <strong>All schools</strong>
              <span>{pagination.total} schools</span>
            </div>
            <div className="table-scroll">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>School Name</th>
                    <th>School ID</th>
                    <th>District</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Principal</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="table-message">
                        No schools found.
                      </td>
                    </tr>
                  ) : (
                    schools.map((item) => (
                      <tr key={item._id}>
                        <td className="table-name">{item.schoolName}</td>
                        <td>{item.schoolId}</td>
                        <td>{item.district}</td>
                        <td>{item.phone || "—"}</td>
                        <td>{item.email || "—"}</td>
                        <td>{item.principalName || "—"}</td>
                        <td>
                          <span
                            className={`status-pill status-${item.status?.toLowerCase()}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td>
                          <div className="school-actions">
                            <button
                              className="edit-link"
                              type="button"
                              onClick={() => openEditForm(item)}
                            >
                              <FiEdit2 /> Edit
                            </button>
                            <button
                              className="status-action"
                              type="button"
                              onClick={() => changeStatus(item)}
                              disabled={statusUpdating === String(item._id)}
                            >
                              {statusUpdating === String(item._id)
                                ? "Saving…"
                                : item.status === "ACTIVE"
                                  ? "Suspend"
                                  : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="pagination-bar">
              <span>
                Page {pagination.page || page} of {pagination.totalPages || 1}
              </span>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    setPage((current) => Math.max(1, current - 1));
                  }}
                  disabled={page <= 1 || loading}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    setPage((current) =>
                      Math.min(pagination.totalPages || 1, current + 1),
                    );
                  }}
                  disabled={loading || page >= (pagination.totalPages || 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      ) : school ? (
        <>
          <div className="school-form-card">
            <div className="school-card-heading">
              <div>
                <span className="eyebrow">School profile</span>
                <h3>{school.schoolName}</h3>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => openEditForm(school)}
              >
                <FiEdit2 /> Edit information
              </button>
            </div>
            <div className="school-details-grid">
              <Info label="School ID" value={school.schoolId} />
              <Info label="School Name" value={school.schoolName} />
              <Info label="District" value={school.district} />
              <Info label="Phone" value={school.phone} />
              <Info label="Email" value={school.email} />
              <Info label="Principal Name" value={school.principalName} />
              <div className="school-info-item">
                <span>Status</span>
                <strong>
                  <span
                    className={`status-pill status-${school.status?.toLowerCase()}`}
                  >
                    {school.status}
                  </span>
                </strong>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="school-loading">
          School information is not available.
        </div>
      )}

      {modalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              closeSchoolModal();
          }}
        >
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="school-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {editingSchool ? "Update school" : "New school"}
                </span>
                <h2 id="school-modal-title">
                  {editingSchool ? "Edit school information" : "Add School"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close"
                type="button"
                onClick={closeSchoolModal}
                disabled={saving}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveSchool}>
              {!editingSchool && (
                <>
                  <label htmlFor="school-id">School ID</label>
                  <input
                    id="school-id"
                    className="form-input"
                    name="schoolId"
                    value={form.schoolId}
                    onChange={updateForm}
                    placeholder="e.g. SCH001"
                    required
                  />
                </>
              )}
              <label htmlFor="school-name">School Name</label>
              <input
                id="school-name"
                className="form-input"
                name="schoolName"
                value={form.schoolName}
                onChange={updateForm}
                required
              />
              <label htmlFor="school-district">District</label>
              <input
                id="school-district"
                className="form-input"
                name="district"
                value={form.district}
                onChange={updateForm}
                required
              />
              <label htmlFor="school-phone">Phone</label>
              <input
                id="school-phone"
                className="form-input"
                name="phone"
                value={form.phone}
                onChange={updateForm}
              />
              <label htmlFor="school-email">Email</label>
              <input
                id="school-email"
                className="form-input"
                name="email"
                type="email"
                value={form.email}
                onChange={updateForm}
              />
              <label htmlFor="school-principal">Principal Name</label>
              <input
                id="school-principal"
                className="form-input"
                name="principalName"
                value={form.principalName}
                onChange={updateForm}
              />
              <label htmlFor="school-logo">School Logo</label>
              {(logoPreview || editingSchool?.logo) && (
                <div className="school-logo-preview-row">
                  <div className="school-logo-preview-box">
                    <img
                      className="school-logo-preview"
                      src={logoPreview || getAssetUrl(editingSchool.logo)}
                      alt="School logo preview"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                        event.currentTarget.nextElementSibling.hidden = false;
                      }}
                    />
                    <span className="school-logo-fallback" hidden>
                      <FiBookOpen />
                    </span>
                  </div>
                  <span>{logoFile ? logoFile.name : "Current school logo"}</span>
                </div>
              )}
              {!logoPreview && !editingSchool?.logo && (
                <div className="school-logo-preview-box school-logo-empty-preview">
                  <FiBookOpen />
                  <span>No logo selected</span>
                </div>
              )}
              <input
                id="school-logo"
                className="form-input school-logo-input"
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                onChange={selectSchoolLogo}
              />
              <span className="input-hint">PNG, JPG, JPEG, or WebP. Maximum size: 2 MB.</span>
              {error && (
                <div role="alert" className="form-error">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeSchoolModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : editingSchool
                      ? "Save changes"
                      : "Create School"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div className="school-info-item">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}
