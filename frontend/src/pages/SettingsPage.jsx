import { useEffect, useState } from "react";
import { Slack, Link2, CheckCircle2, Mail, ShieldCheck, Clock, Eye, EyeOff } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext";
import { slackService } from "@/services/slackService";
import { authService } from "@/services/authService";
import { getErrorMessage } from "@/lib/apiClient";
import { DEFAULTS } from "@/constants";
import { toast } from "sonner";

function Section({ title, description, children }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 surface-shadow">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [slack, setSlack] = useState({ connected: false });
  const [webhook, setWebhook] = useState("");
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  // View-only toggle: hiding never mutates the underlying settings.
  const [showDetails, setShowDetails] = useState(true);

  useEffect(() => {
    slackService.getStatus().then(setSlack).catch(() => {});
    authService.getConfig().then(setConfig).catch(() => {});
    // Handle Slack OAuth redirect result
    const params = new URLSearchParams(window.location.search);
    const slackParam = params.get("slack");
    if (slackParam === "connected") {
      toast.success("Slack connected");
      slackService.getStatus().then(setSlack).catch(() => {});
      window.history.replaceState({}, "", "/dashboard/settings");
    } else if (slackParam === "error") {
      toast.error("Slack connection failed");
      window.history.replaceState({}, "", "/dashboard/settings");
    }
  }, []);

  const startOAuth = async () => {
    try {
      const url = await slackService.startOAuth();
      window.location.href = url;
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not start Slack OAuth"));
    }
  };

  const connectSlack = async () => {
    if (!webhook.trim()) return toast.error("Enter a Slack Incoming Webhook URL");
    setSaving(true);
    try {
      const res = await slackService.connect({ webhookUrl: webhook.trim() });
      setSlack(res);
      setWebhook("");
      toast.success("Slack connected");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not connect Slack"));
    } finally {
      setSaving(false);
    }
  };

  const disconnectSlack = async () => {
    try {
      await slackService.disconnect();
      setSlack({ connected: false });
      toast.success("Slack disconnected");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const integrations = [
    {
      icon: Mail,
      name: "Ethereal (Email)",
      status: "Active",
      note: "Test SMTP — no real emails are sent. Preview links appear on sent emails.",
      ok: true,
    },
    {
      icon: ShieldCheck,
      name: "Google / Supabase Auth",
      status: config?.supabaseConfigured ? "Configured" : "Demo mode",
      note: config?.supabaseConfigured
        ? "Google sign-in via Supabase is configured."
        : "Add Supabase keys to enable real Google OAuth.",
      ok: Boolean(config?.supabaseConfigured),
    },
  ];

  return (
    <DashboardLayout title="Settings">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">Settings</h2>
      <p className="text-sm text-muted-foreground">
        Manage your profile, integrations, and sending defaults.
      </p>

      <div className="mt-6 grid gap-5">
        <Section title="Profile">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage
                src={user?.avatarUrl}
                alt={user?.name || "Profile"}
                referrerPolicy="no-referrer"
              />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {user?.name?.slice(0, 2)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-base font-semibold text-foreground">{user?.name}</div>
              <div className="text-sm text-muted-foreground">{user?.email}</div>
            </div>
          </div>
        </Section>

        <Section
          title="Slack Notifications"
          description="Get notified when a sender hits its hourly limit. Connect an Incoming Webhook URL."
        >
          {slack.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-3">
                <Slack className="h-5 w-5 text-emerald-600" />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" /> Connected
                  </div>
                  <div className="text-xs text-emerald-700">
                    {slack.teamName || "Slack Workspace"}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={disconnectSlack} data-testid="slack-disconnect">
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {config?.slackOAuthConfigured && (
                <div className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Slack className="h-5 w-5 text-[#4A154B]" />
                      <span className="text-sm font-medium text-foreground">
                        Connect with Slack (OAuth)
                      </span>
                    </div>
                    <Button onClick={startOAuth} className="gap-2" data-testid="slack-oauth-connect">
                      <Link2 className="h-4 w-4" /> Connect Slack
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    You'll authorize ReachInbox and pick a channel; we post there when a sender
                    hits its hourly limit.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="webhook">
                  {config?.slackOAuthConfigured ? "Or paste an Incoming Webhook URL" : "Slack Incoming Webhook URL"}
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="webhook"
                    data-testid="slack-webhook-input"
                    placeholder="https://hooks.slack.com/services/…"
                    value={webhook}
                    onChange={(e) => setWebhook(e.target.value)}
                  />
                  <Button onClick={connectSlack} disabled={saving} className="gap-2 sm:w-40" data-testid="slack-connect">
                    <Link2 className="h-4 w-4" /> {saving ? "Connecting…" : "Connect"}
                  </Button>
                </div>
              </div>
              {!config?.slackOAuthConfigured && (
                <p className="text-xs text-muted-foreground">
                  Add SLACK_CLIENT_ID / SLACK_CLIENT_SECRET to enable the one-click "Connect Slack" OAuth button.
                </p>
              )}
            </div>
          )}
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Integrations &amp; Sending Defaults
            </h3>
            <p className="text-sm text-muted-foreground">
              Hiding these only changes what is shown — nothing is disconnected or reset.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            aria-controls="settings-details"
            data-testid="toggle-details"
            className="gap-2"
          >
            {showDetails ? (
              <>
                <EyeOff className="h-4 w-4" /> Hide
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" /> Show
              </>
            )}
          </Button>
        </div>

        {showDetails ? (
          <div id="settings-details" className="grid gap-5">
            <Section title="Integrations">
              <div className="grid gap-3 sm:grid-cols-2">
                {integrations.map((i) => (
                  <div key={i.name} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <i.icon className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">{i.name}</span>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          i.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {i.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{i.note}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title="Sending Defaults"
              description="Configured on the backend via environment variables."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-border p-4">
                  <Clock className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {DEFAULTS.delayMs / 1000}s minimum delay
                    </div>
                    <div className="text-xs text-muted-foreground">Between individual sends</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border p-4">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {DEFAULTS.hourlyLimit} / hour
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Default per-sender hourly limit
                    </div>
                  </div>
                </div>
              </div>
            </Section>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
