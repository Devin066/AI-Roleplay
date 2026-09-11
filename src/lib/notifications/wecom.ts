const webhookHost = "qyapi.weixin.qq.com";
const webhookPath = "/cgi-bin/webhook/send";
const deliveryTimeoutMilliseconds = 4000;

type NewFeedbackTicket = {
  ticketNumber: number;
  category: "feedback" | "bug";
  title: string;
  description: string;
  userName: string;
  userEmail: string;
  pagePath: string;
  attachmentName?: string | null;
  ticketUrl: string;
};

function getWebhookUrl() {
  const rawUrl = process.env.WECOM_FEEDBACK_WEBHOOK_URL?.trim();
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const hasValidKey = Boolean(url.searchParams.get("key"));
    if (
      url.protocol !== "https:" ||
      url.hostname !== webhookHost ||
      url.pathname !== webhookPath ||
      !hasValidKey
    ) {
      throw new Error("The URL is not a WeCom group robot webhook.");
    }
    return url.toString();
  } catch {
    // Never print the webhook URL: its query key is a credential.
    console.error("WeCom feedback notification was skipped because its webhook URL is invalid.");
    return null;
  }
}

function markdownText(value: string) {
  return value
    .replace(/[\\`*_{}\[\]()<>#+\-.!|]/g, "\\$&")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function compactDescription(value: string) {
  const normalized = value.replace(/[\r\n]+/g, " ").trim();
  const limit = 700;
  return markdownText(
    normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized,
  );
}

function ticketLink(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return `\n> [Open this ticket in Control Panel](${url.toString()})`;
  } catch {
    return "";
  }
}

function ticketReference(ticket: NewFeedbackTicket) {
  const prefix = ticket.category === "bug" ? "BUG" : "FB";
  return `${prefix}-${ticket.ticketNumber.toString().padStart(5, "0")}`;
}

function createMessage(ticket: NewFeedbackTicket) {
  const category = ticket.category === "bug" ? "Bug report" : "Feedback";
  const attachment = ticket.attachmentName
    ? `\n> **Attachment:** ${markdownText(ticket.attachmentName)} (metadata only)`
    : "";

  return [
    `## AI RolePlay: New ${category}`,
    `> **Ticket:** ${ticketReference(ticket)}`,
    `> **Title:** ${markdownText(ticket.title)}`,
    `> **Description:** ${compactDescription(ticket.description)}`,
    `> **Reported by:** ${markdownText(ticket.userName)} (${markdownText(ticket.userEmail)})`,
    `> **Page:** ${markdownText(ticket.pagePath)}`,
  ].join("\n") + attachment + ticketLink(ticket.ticketUrl);
}

/** Sends a best-effort group notification after the ticket has been persisted. */
export async function notifyWeComOfNewFeedback(ticket: NewFeedbackTicket) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deliveryTimeoutMilliseconds);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "markdown",
        markdown: { content: createMessage(ticket) },
      }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as { errcode?: number } | null;

    if (!response.ok || payload?.errcode !== 0) {
      console.error("WeCom feedback notification delivery failed.", {
        status: response.status,
        errcode: payload?.errcode,
      });
    }
  } catch (error) {
    console.error("WeCom feedback notification delivery failed.", {
      reason: error instanceof Error ? error.name : "Unknown error",
    });
  } finally {
    clearTimeout(timeout);
  }
}
