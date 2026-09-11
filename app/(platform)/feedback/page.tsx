import Link from "next/link";
import { redirect } from "next/navigation";

import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getAuthSession } from "@/src/lib/auth/session";

export default async function FeedbackPage() {
  const user = await getAuthSession();

  if (!user) {
    redirect("/login");
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Send feedback"
        description="Tell us what is working, what is getting in your way, or where the experience could be stronger."
      />
      <Card>
        <CardHeader>
          <CardTitle>Help us improve AI RolePlay</CardTitle>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Clear details help us understand the context and follow up on issues faster.
          </p>
        </CardHeader>
        <CardContent>
          <FeedbackForm reportedFrom={{ path: "/feedback", label: "Feedback" }} />
        </CardContent>
      </Card>
      <Link
        href="/profile"
        className="inline-flex min-h-control items-center rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Back to profile
      </Link>
    </section>
  );
}
