import { RoleGuard } from "@/components/auth/role-guard";
import { UserLearningRecord } from "@/components/admin/user-learning-record";

export default function UserLearningRecordPage() {
  return (
    <RoleGuard allowedRoles={["root_admin"]}>
      <UserLearningRecord />
    </RoleGuard>
  );
}
