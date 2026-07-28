import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/iris")({
  beforeLoad: () => {
    throw redirect({ to: "/vision" });
  },
});
