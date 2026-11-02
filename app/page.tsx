import FlipOSApp from "@/app/components/FlipOSApp";
import { isAuthConfigured } from "@/app/lib/authConfig";

export default function Home() {
  const authEnabled = isAuthConfigured({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  });

  return <FlipOSApp authEnabled={authEnabled} />;
}
