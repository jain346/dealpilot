/* ================================================================
   SETTINGS PAGE
   ================================================================ */

import type { User } from "../types";
import { useToast } from "../context/ToastContext";
import { PageFrame, DisabledButton } from "../components";

export function SettingsPage({ user }: { user: User }) {
  const toast = useToast();

  return (
    <PageFrame
      eyebrow="Workspace controls"
      title="Settings"
      subtitle="Manage your DealPilot account, intelligence preferences, and workspace configuration."
    >
      <div className="settings-grid">
        <section className="panel settings-card">
          <div className="settings-card-header">
            <span className="kicker">Account & Identity</span>
            <h3>Creator Account</h3>
          </div>
          <div className="settings-user-preview">
            <div className="settings-avatar">
              {(user.username || "U").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="settings-user-name">@{user.username}</div>
              <div className="settings-user-role">DealPilot Creator Workspace</div>
            </div>
          </div>
          <div className="settings-form">
            <label>
              Username
              <input disabled value={user.username} />
            </label>
            <label>
              Email address
              <input disabled value={user.email || "No email linked (Local Workspace)"} />
            </label>
            <label>
              Account status
              <input disabled value="Active • Creator Deal Desk Initialized" />
            </label>
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-card-header">
            <span className="kicker">Intelligence & Deals</span>
            <h3>DealDesk Preferences</h3>
          </div>
          <div className="settings-form">
            <label>
              Target Currency
              <input disabled value="USD ($) • Normalized Global Deals" />
            </label>
            <label>
              Intelligence Engine
              <input disabled value="DealPilot Multi-Agent (Director + Opportunity + Research + Fit)" />
            </label>
            <label>
              Signal Source
              <input disabled value="Live Commercial Radar & Creator Direct Programs" />
            </label>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => toast.info("Cache refreshed with latest signals.")}
            >
              Refresh Workspace Cache
            </button>
          </div>
        </section>

        <section className="panel settings-card settings-danger-zone">
          <div className="settings-card-header">
            <span className="kicker danger-kicker">Security & Access</span>
            <h3>Session Management</h3>
          </div>
          <p className="settings-danger-desc">
            Manage your account credentials and active authentication sessions.
          </p>
          <div className="settings-actions">
            <DisabledButton>Change password</DisabledButton>
            <DisabledButton>Sign out other sessions</DisabledButton>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
