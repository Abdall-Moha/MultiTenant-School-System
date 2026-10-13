import { usePageNotifications } from "../context/NotificationContext.jsx";
import { useCallback, useEffect, useState } from "react";
import {
  FiCalendar,
  FiEdit2,
  FiMapPin,
  FiPlus,
  FiTrash2,
} from "react-icons/fi";
import { useAuth } from "../hooks/useAuth.js";
import api, { getApiError } from "../services/api.js";

const PAGE_SIZE = 20;
const MONTH_NAMES = [
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
const blankEvent = {
  title: "",
  description: "",
  eventDate: "",
  location: "",
  schoolId: "",
};

function displayDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return `${date.getUTCDate()}/${MONTH_NAMES[date.getUTCMonth()]}/${date.getUTCFullYear()}`;
}

export default function Events() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManage = ["SUPER_ADMIN", "ADMIN"].includes(user?.role);
  const [events, setEvents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [schoolFilter, setSchoolFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankEvent);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  usePageNotifications(error, notice);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: PAGE_SIZE };
      if (isSuperAdmin && schoolFilter) params.schoolId = schoolFilter;
      const { data } = await api.get("/events", { params });
      setEvents(data.events || []);
      setPagination(
        data.pagination || {
          page,
          total: data.events?.length || 0,
          totalPages: 1,
        },
      );
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, page, schoolFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api
      .get("/schools", { params: { page: 1, limit: 100 } })
      .then(({ data }) => setSchools(data.schools || []))
      .catch((requestError) => setError(getApiError(requestError)));
  }, [isSuperAdmin]);

  function openCreate() {
    setEditing(null);
    setForm(blankEvent);
    setError("");
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      title: item.title || "",
      description: item.description || "",
      eventDate: item.eventDate?.slice(0, 10) || "",
      location: item.location || "",
      schoolId: "",
    });
    setError("");
    setModalOpen(true);
  }

  async function saveEvent(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.eventDate) {
      setError("Title and event date are required.");
      return;
    }
    if (!editing && isSuperAdmin && !form.schoolId) {
      setError("Select a school before creating the event.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const details = {
      title: form.title.trim(),
      description: form.description.trim(),
      eventDate: form.eventDate,
      location: form.location.trim(),
    };
    if (!editing && isSuperAdmin) details.schoolId = form.schoolId;
    try {
      if (editing) await api.put(`/events/${editing._id}`, details);
      else await api.post("/events", details);
      setModalOpen(false);
      setNotice(
        editing ? "Event updated successfully." : "Event created successfully.",
      );
      await loadEvents();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(item) {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    setError("");
    setNotice("");
    try {
      await api.delete(`/events/${item._id}`);
      setNotice("Event deleted successfully.");
      await loadEvents();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <section className="school-page events-page">
      <div className="school-heading">
        <div>
          <span className="eyebrow">School news</span>
          <h2>Events</h2>
          <p>Stay updated with school announcements and important events.</p>
        </div>
        {canManage && (
          <button type="button" className="primary-button" onClick={openCreate}>
            <FiPlus /> Add Event
          </button>
        )}
      </div>
      {error && !modalOpen && (
        <div role="alert" className="form-error page-message">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="success-message page-message">
          {notice}
        </div>
      )}
      {isSuperAdmin && (
        <div className="event-filters">
          <select
            className="form-input"
            aria-label="Filter by school"
            value={schoolFilter}
            onChange={(event) => {
              setPage(1);
              setSchoolFilter(event.target.value);
            }}
          >
            <option value="">All schools</option>
            {schools.map((school) => (
              <option key={school._id} value={school._id}>
                {school.schoolName}
              </option>
            ))}
          </select>
        </div>
      )}
      {loading ? (
        <div className="school-loading">Loading events…</div>
      ) : events.length ? (
        <div className="event-feed">
          {events.map((item) => (
            <article className="event-card" key={item._id}>
              <div className="event-card-heading">
                <div>
                  <span className="eyebrow">School announcement</span>
                  <h3>{item.title}</h3>
                </div>
                {canManage && (
                  <div className="school-actions">
                    <button
                      type="button"
                      className="edit-link"
                      onClick={() => openEdit(item)}
                    >
                      <FiEdit2 /> Edit
                    </button>
                    <button
                      type="button"
                      className="status-action"
                      onClick={() => deleteEvent(item)}
                    >
                      <FiTrash2 /> Delete
                    </button>
                  </div>
                )}
              </div>
              {item.description && (
                <p className="event-description">{item.description}</p>
              )}
              <div className="event-details">
                <span>
                  <FiCalendar /> {displayDate(item.eventDate)}
                </span>
                {item.location && (
                  <span>
                    <FiMapPin /> Location: {item.location}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="event-empty">No events available.</div>
      )}
      {!loading && pagination.totalPages > 1 && (
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

      {modalOpen && (
        <div className="modal-backdrop">
          <section
            className="user-modal school-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">School announcement</span>
                <h2 id="event-modal-title">
                  {editing ? "Edit Event" : "Add Event"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={saveEvent}>
              {!editing && isSuperAdmin && (
                <>
                  <label htmlFor="event-school">School</label>
                  <select
                    id="event-school"
                    className="form-input"
                    value={form.schoolId}
                    onChange={(event) =>
                      setForm({ ...form, schoolId: event.target.value })
                    }
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
              <label htmlFor="event-title">Title</label>
              <input
                id="event-title"
                className="form-input"
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                required
              />
              <label htmlFor="event-description">Description</label>
              <textarea
                id="event-description"
                className="form-input"
                rows="4"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
              <label htmlFor="event-date">Event Date</label>
              <input
                id="event-date"
                className="form-input"
                type="date"
                value={form.eventDate}
                onChange={(event) =>
                  setForm({ ...form, eventDate: event.target.value })
                }
                required
              />
              <label htmlFor="event-location">Location</label>
              <input
                id="event-location"
                className="form-input"
                value={form.location}
                onChange={(event) =>
                  setForm({ ...form, location: event.target.value })
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
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={saving}>
                  {saving
                    ? "Saving…"
                    : editing
                      ? "Save changes"
                      : "Create event"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
