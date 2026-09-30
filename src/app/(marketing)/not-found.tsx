import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-muted">
        The page you are looking for does not exist or has moved.
      </p>
      <div className="mt-8 flex justify-center">
        <ButtonLink href="/">Back to home</ButtonLink>
      </div>
    </div>
  );
}
