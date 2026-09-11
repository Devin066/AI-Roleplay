# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Root admins, course admins, and trainees use the AI RolePlay Academy workspace to create, run, and review simulated customer-call training.

## Product Purpose

AI RolePlay lets course admins build voice roleplay courses and assign learners. Learners complete live AI customer simulations and receive scored assessments; administrators review outcomes and manage the workspace.

## Positioning

The product joins live Agora voice simulations, saved transcripts, and AI-scored coaching in one roleplay-training workflow.

## Operating Context

Users sign in to complete assigned training, manage courses, review attempts, and maintain their account. Feedback is submitted from the account settings menu when users encounter a defect or have a product suggestion.

## Capabilities and Constraints

- Users can change their password from account settings.
- Users categorize submissions as feedback or bugs, then provide a title and description.
- Feedback submissions are persisted in PostgreSQL with the submitting user's identity and the page where the report was opened.
- Root admins triage submissions as ticket records from Control Panel > Feedbacks & Issues.
- Users may select one image or video as supporting context. Until S3 is integrated, the application persists only the attachment metadata and previews the selected file in the form; it does not retain the file binary.
- S3-backed upload and attachment review workflows remain future work.

## Brand Commitments

AI RolePlay Academy is the current product name in the workspace interface.

## Evidence on Hand

The repository README documents course creation, live Agora voice sessions, transcripts, AI-generated assessments, and the three workspace roles. No customer testimonials, photos, or external brand assets are supplied.

## Product Principles

- Keep training work focused and easy to resume.
- Make account and support actions predictable and easy to find.
- Capture enough context to make product issues actionable.
- Preserve user trust by stating clearly what is and is not stored.

## Accessibility & Inclusion

Account and feedback controls must be keyboard accessible, have clear labels and focus states, and work on desktop and mobile layouts.
