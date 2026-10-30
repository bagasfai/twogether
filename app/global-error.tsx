"use client"; // Error boundaries must be Client Components

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    // global-error replaces the root layout, so it owns <html> and <body>
    // and cannot rely on the app's stylesheet.
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          color: "#0a1a5c",
          background: "#f6faff",
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
        <p style={{ margin: 0, color: "#3d4f8a", textAlign: "center" }}>
          The app hit an unexpected error.
          {error.digest ? ` Reference: ${error.digest}` : ""}
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            minHeight: 44,
            padding: "0 20px",
            borderRadius: 999,
            border: "1px solid #0a1a5c",
            background: "#0a1a5c",
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
