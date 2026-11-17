import { useMemo } from "react";
import { encode } from "uqr";

/** Always dark on light, whatever the theme, so every scanner reads it. */
export function QrCode({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const { size, path } = useMemo(() => {
    const { data, size } = encode(value, { border: 2, ecc: "M" });
    let path = "";
    data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) path += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { size, path };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Ticket QR code"
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
