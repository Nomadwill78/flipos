import { UUID_PATTERN } from "@/app/lib/analyticsConstants";
import { recordPaidSuccessConsentRevocations } from "@/app/lib/serverAnalytics";

export async function POST(request: Request) {
  let sessionIds: unknown;
  try {
    sessionIds = (await request.json())?.anonSessionIds;
  } catch {
    return Response.json({ error: "Anonymous session IDs are required." }, { status: 400 });
  }

  if (
    !Array.isArray(sessionIds) ||
    sessionIds.length > 20 ||
    sessionIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))
  ) {
    return Response.json({ error: "Anonymous session IDs are invalid." }, { status: 400 });
  }

  try {
    await recordPaidSuccessConsentRevocations(sessionIds);
    return Response.json({ revoked: sessionIds.length });
  } catch {
    // The caller has already disabled local analytics; webhook tracking fails closed if Redis is unavailable.
    return Response.json({ error: "Consent revocation could not be recorded." }, { status: 503 });
  }
}
