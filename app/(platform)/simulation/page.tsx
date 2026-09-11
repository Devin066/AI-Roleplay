import { PublishedRoleplayCourses } from "@/components/courses/published-roleplay-courses";

export default function SimulationPage() {
  return (
    <div className="space-y-8">
      <header className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] xl:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Start a Roleplay Session
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Select a published simulation assigned to your account. Review the
            customer, scenario, and available attempts before beginning the
            live conversation.
          </p>
        </div>
        <aside className="panel-surface rounded-xl p-5 shadow-raised">
          <h2 className="font-semibold">What happens after the call</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your transcript is saved and your final assessment is available to
            review after the simulation ends.
          </p>
        </aside>
      </header>

      <PublishedRoleplayCourses emptyState />
    </div>
  );
}
