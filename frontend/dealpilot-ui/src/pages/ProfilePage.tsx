/* ================================================================
   PROFILE PAGE & PROFILE FORM
   ================================================================ */

import { useState } from "react";
import type { Profile, Page } from "../types";
import { useToast } from "../context/ToastContext";
import { request, authHeaders, toastForError } from "../api/client";
import { isProfileComplete, profileForForm } from "../utils/format";
import { PageFrame } from "../components";

const profileWizardSteps = ["Your Content", "Audience", "Platforms", "Location", "All Set!"];
const profileNiches = ["Film & Cinema", "Gaming", "Technology", "Fashion & Beauty", "Food", "Travel", "Fitness & Wellness", "Education", "Finance", "Lifestyle", "Sports", "Music", "Comedy", "Business", "Photography", "Other"];
const profilePlatforms = ["YouTube", "Instagram", "TikTok", "Facebook", "X", "Twitch", "LinkedIn", "Pinterest", "Snapchat"];
const profileAudiences = ["General audience", "Gen Z", "Millennials", "Parents & families", "Business professionals", "Students", "Hobbyists & enthusiasts"];
const profileLocations = ["United States", "Canada", "United Kingdom", "Australia", "India", "Germany", "France", "Brazil", "Mexico", "Singapore", "United Arab Emirates", "Other"];

function ProfileForm({
  profile,
  onChange,
  onNavigate,
  onSaved,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onNavigate?: (page: Page) => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const currentAudience = (profile.audience && profile.audience.length > 0)
    ? profile.audience
    : (profile.audience_description?.match(/(?:^|\n)Audience: ([^\n]+)/)?.[1]?.split(", ").filter(Boolean) || []);
  const update = (changes: Partial<Profile>) => onChange({ ...profile, ...changes });
  const requiredComplete = Boolean(profile.niche?.trim() && profile.platforms.length && profile.region?.trim() && profile.audience_size && profile.audience_size > 0);

  const toggleAudience = (option: string) => {
    const next = currentAudience.includes(option)
      ? currentAudience.filter((item) => item !== option)
      : [...currentAudience, option];
    update({
      audience: next,
      audience_description: next.length ? `Audience: ${next.join(", ")}` : null,
    });
  };

  const canContinue = () => {
    if (step === 0) return Boolean(profile.niche);
    if (step === 1) return Boolean(currentAudience.length && profile.audience_size && profile.audience_size > 0);
    if (step === 2) return profile.platforms.length > 0;
    if (step === 3) return Boolean(profile.region);
    return true;
  };

  const advanceStep = () => {
    if (canContinue()) {
      setStep(step + 1);
      const description = currentAudience.length ? `Audience: ${currentAudience.join(", ")}` : (profile.audience_description || null);
      void request<Profile>("/agent/profile", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          ...profile,
          creator_name: profile.creator_name || null,
          niche: profile.niche || null,
          region: profile.region || null,
          audience: currentAudience,
          audience_description: description || null,
        }),
      }).then((saved) => {
        onChange(profileForForm(saved));
      }).catch(() => {});
    } else {
      toast.warning("Please complete this step before continuing.");
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const description = currentAudience.length ? `Audience: ${currentAudience.join(", ")}` : (profile.audience_description || null);
      const saved = await request<Profile>("/agent/profile", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          ...profile,
          creator_name: profile.creator_name || null,
          niche: profile.niche || null,
          region: profile.region || null,
          audience: currentAudience,
          audience_description: description || null,
        }),
      });
      onChange(profileForForm(saved));
      localStorage.setItem("dealpilot:profile_completed", "true");
      toast.success("Creator profile saved successfully.");
      onSaved?.();
      onNavigate?.("conversations");
    } catch (err) { toastForError(toast, err, "Unable to save profile"); } finally { setBusy(false); }
  };

  return (
    <div className="profile-wizard">
      <div className="wizard-progress"><span>Step {step + 1} of {profileWizardSteps.length}</span><span>{Math.round(((step + 1) / profileWizardSteps.length) * 100)}% complete</span></div>
      <div className="wizard-progress-bar"><i style={{ width: `${((step + 1) / profileWizardSteps.length) * 100}%` }} /></div>
      <div className="wizard-stepper">{profileWizardSteps.map((label, index) => <button type="button" key={label} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => index <= step && setStep(index)}><span>{index < step ? "✓" : index + 1}</span><b>{label}</b><small>{index === 0 ? "Let's get to know you" : index === 1 ? "Your reach & community" : index === 2 ? "Where you create" : index === 3 ? "Your country" : "Start exploring"}</small></button>)}</div>
      <form className="wizard-content" onSubmit={(event) => { event.preventDefault(); if (step < profileWizardSteps.length - 1) { advanceStep(); } else void save(); }}>
        {step === 0 && <><span className="wizard-required">• Required</span><h2>What's your primary content niche?</h2><p>Select the option that best describes the type of content you create.</p><div className="wizard-options niche-options">{profileNiches.map((option) => <button type="button" key={option} className={profile.niche === option ? "selected" : ""} onClick={() => update({ niche: option })}><span className="wizard-option-icon">{["🎬", "🎮", "💻", "💄", "🍔", "✈️", "🏋️", "📚", "📊", "💗", "⚽", "🎵", "😊", "💼", "📷", "•••"][profileNiches.indexOf(option)]}</span><b>{option}</b><small>{option === "Technology" ? "Tech reviews, gadgets, AI, software" : option === "Gaming" ? "Gameplay, streaming, esports" : `Create ${option.toLowerCase()} content`}</small>{profile.niche === option && <em>✓</em>}</button>)}</div></>}
        {step === 1 && <><h2>Who is your audience?</h2><p>Select all the audience groups you reach and tell us how large your community is.</p><div className="wizard-options compact-options">{profileAudiences.map((option) => <button type="button" key={option} className={currentAudience.includes(option) ? "selected" : ""} onClick={() => toggleAudience(option)}><b>{option}</b>{currentAudience.includes(option) && <em>✓</em>}</button>)}</div><label className="wizard-number-field">Audience size *<input type="number" min="1" value={profile.audience_size ?? ""} onChange={(event) => update({ audience_size: event.target.value ? Number(event.target.value) : null })} placeholder="Enter your audience size" /></label></>}
        {step === 2 && <><h2>Which platforms do you create on?</h2><p>Select all platforms where you publish content.</p><div className="wizard-options compact-options platform-options">{profilePlatforms.map((option) => <button type="button" key={option} className={profile.platforms.includes(option) ? "selected" : ""} onClick={() => update({ platforms: profile.platforms.includes(option) ? profile.platforms.filter((item) => item !== option) : [...profile.platforms, option] })}><b>{option}</b>{profile.platforms.includes(option) && <em>✓</em>}</button>)}</div></>}
        {step === 3 && <><h2>Where is your audience located?</h2><p>Choose the country that best represents your audience.</p><div className="wizard-options compact-options">{profileLocations.map((option) => <button type="button" key={option} className={profile.region === option ? "selected" : ""} onClick={() => update({ region: option })}><b>{option}</b>{profile.region === option && <em>✓</em>}</button>)}</div></>}
        {step === 4 && <><h2>Your creator profile is ready.</h2><p>Review your selections. You can update these details later from your Profile tab.</p><div className="wizard-review">{[["Content niche", profile.niche], ["Audience", currentAudience.join(", ")], ["Audience size", profile.audience_size?.toLocaleString()], ["Platforms", profile.platforms.join(", ")], ["Country", profile.region]].map(([label, value]) => <div key={label as string}><small>{label}</small><b>{value || "Not provided"}</b></div>)}</div></>}
        <div className="wizard-actions">{step > 0 && <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>← Back</button>}<button className="button primary profile-save-btn" disabled={busy}>{busy ? "Saving…" : step === profileWizardSteps.length - 1 ? "Save profile" : "Continue →"}</button></div>
      </form>
      {requiredComplete && <p className="wizard-edit-note">Your saved details are shown in your profile summary and can be edited here.</p>}
    </div>
  );
}

export function ProfilePage({
  profile,
  onChange,
  onNavigate,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onNavigate?: (page: Page) => void;
}) {
  const ready = isProfileComplete(profile);
  const [editing, setEditing] = useState(!ready || localStorage.getItem("dealpilot:profile_completed") !== "true");

  const savedAudience = (profile.audience && profile.audience.length > 0)
    ? profile.audience.join(", ")
    : (profile.audience_description?.match(/(?:^|\n)Audience: ([^\n]+)/)?.[1] || "Not provided");

  return (
    <PageFrame
      eyebrow="Your signal source"
      title="Creator profile"
      subtitle="This profile persists across every conversation and shapes opportunity relevance."
    >
      {ready && !editing && (
        <div className="profile-complete-banner">
          <div>
            <span className="banner-badge">✓ Profile Set Up Complete</span>
            <p>Your profile is fully configured. Start chatting with DealPilot Agent to evaluate sponsor opportunities.</p>
          </div>
          {onNavigate && (
            <button className="button primary hero-chat-button" onClick={() => onNavigate("conversations")}>Converse with Agent →</button>
          )}
        </div>
      )}
      <div className="profile-layout">
        {ready && !editing ? (
          <section className="panel saved-profile-panel">
            <div className="panel-heading">
              <div><span className="kicker">Saved profile</span><h3>Your creator details</h3></div>
              <button className="button secondary" onClick={() => setEditing(true)}>Edit profile</button>
            </div>
            <div className="saved-profile-grid">
              <div><small>Content niche</small><strong>{profile.niche}</strong></div>
              <div><small>Audience</small><strong>{savedAudience}</strong></div>
              <div><small>Audience size</small><strong>{profile.audience_size?.toLocaleString()}</strong></div>
              <div><small>Platforms</small><strong>{profile.platforms.join(", ")}</strong></div>
              <div><small>Country</small><strong>{profile.region}</strong></div>
            </div>
            {onNavigate && <button className="button primary" onClick={() => onNavigate("conversations")}>Converse with Agent →</button>}
          </section>
        ) : (
          <section className="panel">
            <div className="panel-heading"><div><span className="kicker">{ready ? "Edit profile" : "Profile setup"}</span><h3>{ready ? "Update your creator details" : "Create your creator profile"}</h3></div></div>
            <ProfileForm profile={profile} onChange={onChange} onNavigate={onNavigate} onSaved={() => setEditing(false)} />
          </section>
        )}
      </div>
    </PageFrame>
  );
}
