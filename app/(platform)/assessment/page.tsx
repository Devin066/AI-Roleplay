import { FinalAssessmentsList } from "@/components/assessment/final-assessments-list";

export default function AssessmentPage() {
  return (
    <div className="space-y-6">
      <FinalAssessmentsList initialScope="mine" />
    </div>
  );
}
