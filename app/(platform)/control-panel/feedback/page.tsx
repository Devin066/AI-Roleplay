import { FeedbackTicketsPanel } from "@/components/admin/feedback-tickets-panel";
import { RoleGuard } from "@/components/auth/role-guard";

export default function ControlPanelFeedbackPage() {
  return (
    <RoleGuard allowedRoles={["root_admin"]}>
      <FeedbackTicketsPanel />
    </RoleGuard>
  );
}
