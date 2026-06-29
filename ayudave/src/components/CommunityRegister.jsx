import { useState } from "react";
import { registerCommunityMember } from "../lib/api";
import { Icon } from "./Icon";

const localMembersKey = "ayudave-community-members-pending-v1";

function savePendingMember(member) {
  try {
    const current = JSON.parse(localStorage.getItem(localMembersKey) || "[]");
    const next = Array.isArray(current) ? current : [];
    next.unshift({ ...member, id: `local-member-${Date.now()}`, status: "Pendiente local" });
    localStorage.setItem(localMembersKey, JSON.stringify(next.slice(0, 20)));
  } catch {
    // Local persistence is a fallback only.
  }
}

const initialForm = {
  alias: "",
  role: "voluntario",
  area: "",
  availability: "",
  contactType: "whatsapp",
  contact: "",
  notes: "",
  privacyConsent: false,
  website: "",
};

export function CommunityRegister({ t }) {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitRegistration(event) {
    event.preventDefault();
    setStatus("");
    setIsError(false);
    setIsSubmitting(true);
    try {
      const member = await registerCommunityMember(form);
      setStatus(`${t.communityRegister.saved} ${member.contactMasked ? `(${member.contactMasked})` : ""}`);
      setForm(initialForm);
    } catch (error) {
      savePendingMember(form);
      console.warn(error.message);
      setStatus(t.communityRegister.savedLocal);
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="guide-card community-register-card">
      <div className="community-register-head">
        <div>
          <h2>{t.communityRegister.title}</h2>
          <p>{t.communityRegister.body}</p>
        </div>
        <Icon name="users" />
      </div>
      <form className="community-register-form" onSubmit={submitRegistration}>
        <input
          aria-hidden="true"
          autoComplete="off"
          className="hp-field"
          onChange={(event) => updateField("website", event.target.value)}
          tabIndex="-1"
          value={form.website}
        />
        <label>
          {t.communityRegister.alias}
          <input
            maxLength="80"
            onChange={(event) => updateField("alias", event.target.value)}
            placeholder={t.communityRegister.aliasPlaceholder}
            required
            value={form.alias}
          />
        </label>
        <label>
          {t.communityRegister.role}
          <select onChange={(event) => updateField("role", event.target.value)} value={form.role}>
            {t.communityRegister.roles.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="form-wide">
          {t.communityRegister.area}
          <input
            maxLength="160"
            onChange={(event) => updateField("area", event.target.value)}
            placeholder={t.communityRegister.areaPlaceholder}
            required
            value={form.area}
          />
        </label>
        <label>
          {t.communityRegister.availability}
          <input
            maxLength="120"
            onChange={(event) => updateField("availability", event.target.value)}
            placeholder={t.communityRegister.availabilityPlaceholder}
            value={form.availability}
          />
        </label>
        <label>
          {t.communityRegister.contactType}
          <select onChange={(event) => updateField("contactType", event.target.value)} value={form.contactType}>
            {t.communityRegister.contactTypes.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="form-wide">
          {t.communityRegister.contact}
          <input
            maxLength="180"
            onChange={(event) => updateField("contact", event.target.value)}
            placeholder={t.communityRegister.contactPlaceholder}
            value={form.contact}
          />
        </label>
        <label className="form-wide">
          {t.communityRegister.notes}
          <textarea
            maxLength="260"
            onChange={(event) => updateField("notes", event.target.value)}
            placeholder={t.communityRegister.notesPlaceholder}
            value={form.notes}
          />
        </label>
        <label className="community-consent form-wide">
          <input
            checked={form.privacyConsent}
            onChange={(event) => updateField("privacyConsent", event.target.checked)}
            required
            type="checkbox"
          />
          <span>{t.communityRegister.consent}</span>
        </label>
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? t.communityRegister.sending : t.communityRegister.submit}
        </button>
        <p className={isError ? "is-error" : ""} role="status">{status}</p>
      </form>
    </article>
  );
}
