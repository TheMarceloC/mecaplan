import type { Activity, Project, PublicUser } from "../../lib/model";
export type Action =
  | "read"
  | "project:create"
  | "project:edit"
  | "activity:edit"
  | "activity:status"
  | "comment"
  | "members:edit"
  | "global:edit"
  | "budget:edit"
  | "approve"
  | "context"
  | "evaluate";
export function can(
  user: PublicUser | null,
  action: Action,
  project?: Project,
  activity?: Activity,
): boolean {
  if (!user || user.status !== "active" || !!user.mustChangePassword)
    return false;
  if (action === "evaluate") return !!user.isInstructor;
  if (user.globalRole === "superuser") return true;
  if (action === "global:edit" || action === "project:create") return false;
  const member = project?.members.find((m) => m.id === user.id);
  if (!member) return false;
  if (action === "read" || action === "comment") return true;
  if (member.role === "admin") return true;
  if (action === "budget:edit" || action === "context") return member.lead;
  if (action === "activity:edit")
    return !!activity && member.lead && member.teamId === activity.teamId;
  if (action === "activity:status")
    return (
      !!activity &&
      ((member.lead && member.teamId === activity.teamId) ||
        activity.responsible.includes(user.id) ||
        activity.accountable === user.id)
    );
  return false;
}
