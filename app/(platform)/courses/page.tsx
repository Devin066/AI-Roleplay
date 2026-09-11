import { PublishedRoleplayCourses } from "@/components/courses/published-roleplay-courses";

export default function CoursesPage() {
  return (
    <div className="space-y-8">
      <header className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] xl:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Simulation Courses
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Choose an assigned customer simulation, prepare around the stated
            objectives, and complete the live AI conversation when you are
            ready to be assessed.
          </p>
        </div>
        <aside className="panel-surface rounded-xl p-5 shadow-raised">
          <h2 className="font-semibold">A focused session, end to end</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Every available course includes the customer context, allotted
            time, learning objectives, and any remaining attempts before you
            enter the call.
          </p>
        </aside>
      </header>

      <PublishedRoleplayCourses emptyState />
    </div>
  );
}
