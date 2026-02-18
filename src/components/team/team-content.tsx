"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { InviteDialog } from "./invite-dialog";
import type { TeamMember, ClinicRole } from "@/types";

export function TeamContent() {
  const t = useTranslations("team");

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentRole, setCurrentRole] = useState<ClinicRole>("reception");
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  const isOwner = currentRole === "owner";

  useEffect(() => {
    async function fetchTeam() {
      try {
        const res = await fetch("/api/team");
        if (!res.ok) {
          console.error("[team] failed to fetch:", res.status);
          return;
        }
        const json = await res.json();
        if (json.data) {
          setMembers(json.data.members);
          setCurrentUserId(json.data.currentUserId);
          setCurrentRole(json.data.currentRole);
        }
      } catch (err) {
        console.error("[team] fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTeam();
  }, []);

  async function handleRoleChange(member: TeamMember, newRole: ClinicRole) {
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m)),
    );

    const res = await fetch(`/api/team/${member.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });

    if (!res.ok) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, role: member.role } : m,
        ),
      );
    }
  }

  async function handleRemove(member: TeamMember) {
    if (!window.confirm(t("removeConfirm"))) return;

    const res = await fetch(`/api/team/${member.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    }
  }

  async function handleInviteSuccess() {
    const res = await fetch("/api/team");
    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        setMembers(json.data.members);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex justify-end">
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <UserPlus className="size-4" strokeWidth={1.75} />
            {t("invite")}
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {members.length === 0 ? (
          <p
            className="py-8 text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {t("empty")}
          </p>
        ) : (
          members.map((member) => {
            const isSelf = member.user_id === currentUserId;

            return (
              <Card key={member.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name || member.email} size="sm" />
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {member.name || member.email}
                      </p>
                      <p
                        className="text-xs truncate"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwner && !isSelf ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(
                            member,
                            e.target.value as ClinicRole,
                          )
                        }
                        className="rounded-lg border px-2 py-1 text-xs outline-none transition-colors"
                        style={{
                          backgroundColor: "var(--surface)",
                          borderColor: "var(--border)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value="owner">{t("roles.owner")}</option>
                        <option value="reception">
                          {t("roles.reception")}
                        </option>
                      </select>
                    ) : (
                      <Badge
                        variant={
                          member.role === "owner" ? "accent" : "neutral"
                        }
                      >
                        {t(`roles.${member.role}`)}
                      </Badge>
                    )}

                    {isOwner && !isSelf && (
                      <button
                        onClick={() => handleRemove(member)}
                        className="rounded-lg p-1.5 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                        style={{ color: "var(--danger)" }}
                      >
                        <Trash2 className="size-4" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {isOwner && (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onSuccess={handleInviteSuccess}
        />
      )}
    </div>
  );
}
