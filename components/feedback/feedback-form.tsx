"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  CheckIcon,
  ImageIcon,
  PaperclipIcon,
  VideoIcon,
} from "@/components/ui/icons";
import { Field, Input, Select, Textarea, fieldAria } from "@/components/ui/field";

const maxAttachmentSizeBytes = 25 * 1024 * 1024;

type Attachment = {
  name: string;
  type: string;
  size: number;
};

type FeedbackCategory = "feedback" | "bug";

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FeedbackForm({
  reportedFrom,
}: {
  reportedFrom?: { path: string; label: string };
}) {
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("feedback");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function selectAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setAttachmentError(null);

    if (!file) {
      setAttachment(null);
      return;
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setAttachment(null);
      setAttachmentError("Choose an image or video file.");
      event.target.value = "";
      return;
    }

    if (file.size > maxAttachmentSizeBytes) {
      setAttachment(null);
      setAttachmentError("Attachments must be 25 MB or smaller.");
      event.target.value = "";
      return;
    }

    setAttachment({ name: file.name, type: file.type, size: file.size });
  }

  function clearAttachment() {
    setAttachment(null);
    setAttachmentError(null);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (attachmentError) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          description,
          attachment,
          pagePath: reportedFrom?.path,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "We could not send your feedback.");
      }

      setTitle("");
      setDescription("");
      clearAttachment();
      setSuccessMessage("Thanks - your feedback has been sent to the team.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "We could not send your feedback.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const attachmentIsImage = attachment?.type.startsWith("image/");

  return (
    <form onSubmit={submitFeedback} className="flex min-h-full flex-col">
      <div className="space-y-6 p-5 sm:p-6">
        {reportedFrom && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary-subtle px-3 py-2.5 text-xs text-primary-subtle-foreground">
            <span className="font-medium">Reporting from</span>
            <span
              className="min-w-0 truncate font-semibold"
              title={reportedFrom.path}
            >
              {reportedFrom.label}
            </span>
          </div>
        )}
        <div className="grid gap-5">
          <Field label="What are you sharing?" htmlFor="feedback-category" required>
            <Select
              id="feedback-category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as FeedbackCategory)
              }
            >
              <option value="feedback">Feedback or an idea</option>
              <option value="bug">A bug or technical issue</option>
            </Select>
          </Field>
          <Field label="Feedback or issue title" htmlFor="feedback-title" required>
            <Input
              {...fieldAria("feedback-title", {})}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              placeholder="For example: The assessment page does not load"
              required
            />
          </Field>

          <Field
            label="What happened?"
            htmlFor="feedback-description"
            required
            hint="Include the steps you took and what you expected to happen when reporting an issue."
          >
            <Textarea
              {...fieldAria("feedback-description", {
                hint: true,
              })}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={5000}
              placeholder="Tell us what would make this better, or describe the issue you encountered."
              required
            />
          </Field>
        </div>

        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-sunken/65 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-primary shadow-xs">
                <PaperclipIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Add a screenshot or screen recording
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Optional. Choose one image or video up to 25 MB.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => attachmentInputRef.current?.click()}
            >
              {attachment ? "Replace file" : "Choose file"}
            </Button>
          </div>

          <input
            ref={attachmentInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={selectAttachment}
            className="sr-only"
            tabIndex={-1}
          />

          {attachment && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface px-3 py-3 shadow-xs">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                {attachmentIsImage ? (
                  <ImageIcon className="h-4 w-4" />
                ) : (
                  <VideoIcon className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {attachment.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {attachmentIsImage ? "Image" : "Video"} - {formatFileSize(attachment.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={clearAttachment}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Remove
              </button>
            </div>
          )}

          {attachmentError && (
            <p role="alert" className="mt-3 text-xs font-medium text-danger">
              {attachmentError}
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            The file stays on this device for now. We save its details with your
            report and will connect secure file storage when S3 uploads are
            available.
          </p>
        </div>

        {(successMessage || errorMessage) && (
          <div
            role={errorMessage ? "alert" : "status"}
            className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
              errorMessage
                ? "border-danger/30 bg-danger-subtle text-danger-subtle-foreground"
                : "border-success/30 bg-success-subtle text-success-subtle-foreground"
            }`}
          >
            {!errorMessage && <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{errorMessage ?? successMessage}</span>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-col-reverse gap-3 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs leading-5 text-muted-foreground">
          Your name and account email are included so we can follow up.
        </p>
        <Button type="submit" loading={isSaving} loadingText="Sending...">
          Send feedback
        </Button>
      </div>
    </form>
  );
}
