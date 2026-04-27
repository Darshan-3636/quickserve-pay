import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy single-restaurant menu — now redirects to the multi-restaurant explore page.
export const Route = createFileRoute("/menu")({
  beforeLoad: () => {
    throw redirect({ to: "/explore" });
  },
});
