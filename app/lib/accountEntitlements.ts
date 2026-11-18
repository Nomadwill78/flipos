import type { Plan } from "@/app/lib/plan";

export async function setAccountPlan(userId: string, plan: Plan): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY) return;
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { plan },
  });
}
