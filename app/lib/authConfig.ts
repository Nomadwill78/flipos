// Optional account features are available only with both Clerk keys.
// Evaluate this in server entry points and pass only the resulting boolean
// to client components. A publishable key alone must not enable the UI.
export function isAuthConfigured(environment: {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
}): boolean {
  return Boolean(
    environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      environment.CLERK_SECRET_KEY?.trim()
  );
}
